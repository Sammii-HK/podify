import { NextResponse } from "next/server";
import { getJob } from "@/lib/jobs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const job = getJob(jobId);

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: job.id,
    status: job.status,
    progress: job.progress,
    stage: job.stage,
    message: job.message,
    result: job.status === "complete"
      ? {
          transcript: job.result?.transcript,
          durationSeconds: job.result?.durationSeconds,
          wordCount: job.result?.wordCount,
          costUsd: job.result?.costUsd,
        }
      : undefined,
    error: job.error,
  });
}
