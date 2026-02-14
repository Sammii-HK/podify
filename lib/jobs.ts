// ============================================================
// Job manager — in-memory locally, Vercel Blob on Vercel
// ============================================================

import { put, list } from "@vercel/blob";
import { PodcastConfig, ScriptLine } from "@/lib/types";

export interface Job {
  id: string;
  status: "pending" | "processing" | "complete" | "error";
  progress: number;
  stage: "scripting" | "audio" | "assembly" | "complete" | null;
  message: string;
  createdAt: number;
  config?: PodcastConfig;
  result?: {
    audioPath: string;
    transcript: ScriptLine[];
    durationSeconds: number;
    wordCount: number;
    costUsd: number;
  };
  error?: string;
}

function useBlob(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

function jobBlobKey(id: string): string {
  return `jobs/${id}.json`;
}

// ============================================================
// In-memory store (local dev + same-invocation cache on Vercel)
// ============================================================

const globalJobs = globalThis as unknown as {
  __podify_jobs?: Map<string, Job>;
};

if (!globalJobs.__podify_jobs) {
  globalJobs.__podify_jobs = new Map<string, Job>();
}

const jobs = globalJobs.__podify_jobs;

// ============================================================
// Blob helpers
// ============================================================

async function writeJobToBlob(job: Job): Promise<void> {
  await put(jobBlobKey(job.id), JSON.stringify(job), {
    access: "public",
    addRandomSuffix: false,
    contentType: "application/json",
  });
}

async function readJobFromBlob(id: string): Promise<Job | undefined> {
  try {
    const { blobs } = await list({ prefix: jobBlobKey(id) });
    const blob = blobs.find((b) => b.pathname === jobBlobKey(id));
    if (!blob) return undefined;
    const res = await fetch(blob.url);
    return (await res.json()) as Job;
  } catch {
    return undefined;
  }
}

// ============================================================
// Public API
// ============================================================

export async function createJob(): Promise<Job> {
  const id = crypto.randomUUID();
  const job: Job = {
    id,
    status: "pending",
    progress: 0,
    stage: null,
    message: "Queued",
    createdAt: Date.now(),
  };
  jobs.set(id, job);
  if (useBlob()) await writeJobToBlob(job);
  return job;
}

export async function getJob(id: string): Promise<Job | undefined> {
  const local = jobs.get(id);
  if (local) return local;
  if (useBlob()) return readJobFromBlob(id);
  return undefined;
}

export async function updateJob(
  id: string,
  updates: Partial<Job>,
): Promise<void> {
  let job = jobs.get(id);
  if (!job && useBlob()) {
    job = await readJobFromBlob(id);
    if (job) jobs.set(id, job);
  }
  if (job) {
    Object.assign(job, updates);
    if (useBlob()) await writeJobToBlob(job);
  }
}

const STALE_MS = 5 * 60 * 1000; // 5 minutes (matches maxDuration)

function isActive(job: Job): boolean {
  if (job.status !== "pending" && job.status !== "processing") return false;
  // Consider jobs older than 10 minutes as stale
  if (Date.now() - job.createdAt > STALE_MS) return false;
  return true;
}

export async function isAtCapacity(): Promise<boolean> {
  if (!useBlob()) {
    let count = 0;
    for (const job of jobs.values()) {
      if (isActive(job)) count++;
    }
    return count >= 3;
  }
  // On Vercel, check blob for active jobs
  try {
    const { blobs } = await list({ prefix: "jobs/" });
    let active = 0;
    for (const blob of blobs) {
      const res = await fetch(blob.url);
      const job = (await res.json()) as Job;
      if (isActive(job)) active++;
      if (active >= 3) return true;
    }
    return false;
  } catch {
    return false;
  }
}
