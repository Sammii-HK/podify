import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @vercel/blob before importing jobs
vi.mock("@vercel/blob", () => ({
  put: vi.fn().mockResolvedValue({ url: "https://blob.test/job.json" }),
  list: vi.fn().mockResolvedValue({ blobs: [] }),
}));

describe("jobs", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    // Reset in-memory job store
    const g = globalThis as unknown as { __podify_jobs?: Map<string, unknown> };
    g.__podify_jobs = new Map();
    // Ensure blob mode is off for most tests
    delete process.env.BLOB_READ_WRITE_TOKEN;
  });

  it("createJob returns a job with pending status", async () => {
    const { createJob } = await import("@/lib/jobs");
    const job = await createJob();

    expect(job.id).toBeTruthy();
    expect(job.status).toBe("pending");
    expect(job.progress).toBe(0);
    expect(job.message).toBe("Queued");
  });

  it("getJob retrieves a created job", async () => {
    const { createJob, getJob } = await import("@/lib/jobs");
    const job = await createJob();
    const retrieved = await getJob(job.id);

    expect(retrieved).toBeDefined();
    expect(retrieved!.id).toBe(job.id);
  });

  it("updateJob modifies job fields", async () => {
    const { createJob, updateJob, getJob } = await import("@/lib/jobs");
    const job = await createJob();

    await updateJob(job.id, {
      status: "processing",
      stage: "scripting",
      message: "Generating script...",
      progress: 10,
    });

    const updated = await getJob(job.id);
    expect(updated!.status).toBe("processing");
    expect(updated!.stage).toBe("scripting");
    expect(updated!.progress).toBe(10);
  });

  it("updateJob handles error status", async () => {
    const { createJob, updateJob, getJob } = await import("@/lib/jobs");
    const job = await createJob();

    await updateJob(job.id, {
      status: "error",
      message: "Something went wrong",
      error: "Something went wrong",
    });

    const updated = await getJob(job.id);
    expect(updated!.status).toBe("error");
    expect(updated!.error).toBe("Something went wrong");
  });

  it("getJob returns undefined for unknown id", async () => {
    const { getJob } = await import("@/lib/jobs");
    const result = await getJob("nonexistent-id");
    expect(result).toBeUndefined();
  });

  it("isAtCapacity returns false with no active jobs", async () => {
    const { isAtCapacity } = await import("@/lib/jobs");
    expect(await isAtCapacity()).toBe(false);
  });

  it("isAtCapacity returns true at 3 active jobs", async () => {
    const { createJob, isAtCapacity } = await import("@/lib/jobs");
    await createJob();
    await createJob();
    await createJob();

    expect(await isAtCapacity()).toBe(true);
  });
});
