import "dotenv/config";
import { NextResponse } from "next/server";
import { getJob, updateJob } from "@/lib/jobs";
import { generateEpisode } from "@/lib/pipeline";

// This route runs as its own serverless function invocation triggered by the
// client, so it gets the full maxDuration. The browser keeps the connection
// open while this runs — no background task tricks needed.
export const maxDuration = 300;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params;
  const job = await getJob(jobId);

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  if (job.status !== "pending") {
    return NextResponse.json({ error: "Job already started" }, { status: 409 });
  }

  if (!job.config) {
    return NextResponse.json({ error: "Job has no config" }, { status: 400 });
  }

  const config = job.config;
  const outputDir = process.env.VERCEL ? "/tmp/.podify-output" : ".podify-output";

  console.log(`[podify] Processing job ${jobId}`);

  try {
    await updateJob(jobId, { status: "processing", message: "Starting..." });

    const result = await generateEpisode(config, outputDir, async (event) => {
      try {
        await updateJob(jobId, {
          status: "processing",
          stage: event.stage,
          message: event.message,
          progress: event.percent,
        });
      } catch (err) {
        console.error(`[podify] Failed to update progress for job ${jobId}:`, err);
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
    return NextResponse.json({ status: "complete" });
  } catch (err) {
    console.error(`[podify] Generation failed for job ${jobId}:`, err);
    try {
      await updateJob(jobId, {
        status: "error",
        message: err instanceof Error ? err.message : String(err),
        error: err instanceof Error ? err.message : String(err),
      });
    } catch (updateErr) {
      console.error(`[podify] Failed to update error status for job ${jobId}:`, updateErr);
    }
    return NextResponse.json({ error: "Generation failed" }, { status: 500 });
  }
}
