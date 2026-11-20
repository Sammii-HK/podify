import { safeJobMessage, safeStage, operatorDiagnostic, GENERATION_ERROR } from "@/lib/job-messages";
import { requireJob, privateJson } from "@/lib/job-access";


export async function GET(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const access = await requireJob(request, jobId);
  if (access.response) return access.response;
  const job = access.job;

  const baseUrl = (
    process.env.PODIFY_BASE_URL || "http://localhost:3456"
  ).replace(/\/$/, "");

  return privateJson({
    id: job.id,
    status: job.status,
    progress: job.progress,
    stage: safeStage(job.stage),
    message: safeJobMessage(job.status, job.stage),
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
    error: job.status === "error" ? GENERATION_ERROR : undefined,
    diagnostic: access.principal.kind === "operator" ? operatorDiagnostic(job.diagnostic) : undefined,
  });
}
