// ============================================================
// In-memory job manager for async podcast generation
// Uses globalThis to survive HMR in Next.js dev mode
// ============================================================

import { ScriptLine } from "@/lib/types";

export interface Job {
  id: string;
  status: "pending" | "processing" | "complete" | "error";
  progress: number;
  stage: "scripting" | "audio" | "assembly" | "complete" | null;
  message: string;
  createdAt: number;
  result?: {
    audioPath: string;
    transcript: ScriptLine[];
    durationSeconds: number;
    wordCount: number;
    costUsd: number;
  };
  error?: string;
}

const globalJobs = globalThis as unknown as {
  __podify_jobs?: Map<string, Job>;
};

if (!globalJobs.__podify_jobs) {
  globalJobs.__podify_jobs = new Map<string, Job>();
}

const jobs = globalJobs.__podify_jobs;
const MAX_CONCURRENT = 3;
const JOB_TTL_MS = 60 * 60 * 1000; // 1 hour

export function createJob(): Job {
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
  return job;
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

export function updateJob(id: string, updates: Partial<Job>): void {
  const job = jobs.get(id);
  if (job) {
    Object.assign(job, updates);
  }
}

export function activeJobCount(): number {
  let count = 0;
  for (const job of jobs.values()) {
    if (job.status === "pending" || job.status === "processing") {
      count++;
    }
  }
  return count;
}

export function isAtCapacity(): boolean {
  return activeJobCount() >= MAX_CONCURRENT;
}

export function cleanupOldJobs(): void {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (now - job.createdAt > JOB_TTL_MS) {
      jobs.delete(id);
    }
  }
}
