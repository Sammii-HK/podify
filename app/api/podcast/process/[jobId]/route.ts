import { type JobStage, safeDiagnostic, safeJobMessage, logJobFailure, GENERATION_ERROR } from "@/lib/job-messages";
import { requireJob, privateJson } from "@/lib/job-access";
import "dotenv/config";
import { updateJob } from "@/lib/jobs";
import { generateEpisode } from "@/lib/pipeline";

// This route runs as its own serverless function invocation triggered by the
// client, so it gets the full maxDuration. The browser keeps the connection
// open while this runs — no background task tricks needed.
export const maxDuration = 300;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params;
  const access = await requireJob(request, jobId);
  if (access.response) return access.response;
  const job = access.job;

  if (job.status !== "pending") {
    return privateJson({ error: "Job already started" }, { status: 409 });
  }

  if (!job.config) {
    return privateJson({ error: "Job has no config" }, { status: 400 });
  }

  const config = job.config;
  const outputDir = process.env.VERCEL ? "/tmp/.podify-output" : ".podify-output";

  let lastStage: JobStage = job.stage;
  console.log(`[podify] Processing job ${jobId}`);

  try {
    await updateJob(jobId, { status: "processing", message: "Starting..." });

    const result = await generateEpisode(config, outputDir, async (event) => {
      lastStage = event.stage;
      try {
        await updateJob(jobId, {
          status: "processing",
          stage: event.stage,
          message: safeJobMessage("processing", event.stage),
          progress: event.percent,
        });
      } catch (err) {
        logJobFailure(err, "PROGRESS_WRITE_FAILED", jobId, event.stage);
      }
    });

    await updateJob(jobId, {
      status: "complete",
      progress: 100,
      stage: "complete",
      message: "Episode complete!",
      result: {
        audioPath: result.audioPath,
        slug: result.slug,
        blobUrl: result.blobUrl,
        transcript: result.transcript,
        durationSeconds: result.durationSeconds,
        wordCount: result.wordCount,
        costUsd: result.costUsd,
      },
    });

    console.log(`[podify] Job ${jobId} completed successfully`);

    // Trigger Windmill repurpose webhook
    const windmillWebhookUrl = process.env.WINDMILL_WEBHOOK_URL;
    if (windmillWebhookUrl) {
      try {
        const transcriptText = result.transcript
          .map((line) => `${line.speaker}: ${line.text}`)
          .join("\n\n");

        const windmillToken = process.env.WINDMILL_TOKEN;
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (windmillToken) {
          headers["Authorization"] = `Bearer ${windmillToken}`;
        }

        await fetch(windmillWebhookUrl, {
          method: "POST",
          headers,
          body: JSON.stringify({
            content_type: "podcast_transcript",
            title: config.title,
            content: transcriptText,
            source_url: result.blobUrl || "",
            episode_slug: result.slug,
            duration_seconds: result.durationSeconds,
            word_count: result.wordCount,
          }),
        });
        console.log(`[podify] Windmill repurpose webhook triggered for job ${jobId}`);
      } catch (webhookErr) {
        logJobFailure(webhookErr, "WEBHOOK_FAILED", jobId);
      }
    }

    return privateJson({ status: "complete" });
  } catch (err) {
    const diagnostic = safeDiagnostic(err, "GENERATION_FAILED", lastStage);
    logJobFailure(err, "GENERATION_FAILED", jobId, lastStage);
    try {
      await updateJob(jobId, {
        status: "error",
        message: safeJobMessage("error", null),
        error: GENERATION_ERROR,
        diagnostic,
      });
    } catch (updateErr) {
      logJobFailure(updateErr, "ERROR_WRITE_FAILED", jobId);
    }
    return privateJson({ error: GENERATION_ERROR, ...(access.principal.kind === "operator" ? { diagnostic } : {}) }, { status: 500 });
  }
}
