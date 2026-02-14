import { NextResponse } from "next/server";
import { getJob } from "@/lib/jobs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const job = await getJob(jobId);

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const baseUrl = (
    process.env.PODIFY_BASE_URL || "http://localhost:3456"
  ).replace(/\/$/, "");

  return NextResponse.json({
    id: job.id,
    status: job.status,
    progress: job.progress,
    stage: job.stage,
    message: job.message,
    result: job.status === "complete"
      ? {
          slug: job.result?.slug,
          blobUrl: job.result?.blobUrl,
          audioUrl:
            job.result?.blobUrl ||
            (job.result?.slug
              ? `${baseUrl}/api/podcast/episodes/${job.result.slug}/audio`
              : undefined),
          transcript: job.result?.transcript,
          durationSeconds: job.result?.durationSeconds,
          wordCount: job.result?.wordCount,
          costUsd: job.result?.costUsd,
        }
      : undefined,
    error: job.error,
  });
}
