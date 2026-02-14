import "dotenv/config";
import { NextResponse } from "next/server";
import { createJob, updateJob, isAtCapacity } from "@/lib/jobs";
import { generateEpisode } from "@/lib/pipeline";
import { fetchGrimoirePage, fetchUrl } from "@/lib/fetch-content";
import { PodcastConfig, VOICE_PRESETS } from "@/lib/types";

export const maxDuration = 300;

interface GenerateRequest {
  content?: string;
  url?: string;
  grimoire_path?: string;
  title?: string;
  format?: PodcastConfig["format"];
  duration?: PodcastConfig["duration"];
  tone?: PodcastConfig["tone"];
  voices?: string;
  tts?: PodcastConfig["ttsProvider"];
  llm?: PodcastConfig["llmProvider"];
  includeMusic?: boolean;
  instructions?: string;
  async?: boolean; // If true, returns jobId immediately (caller must POST /process/:id)
}

export async function POST(request: Request) {
  try {
    if (await isAtCapacity()) {
      return NextResponse.json(
        { error: "Too many concurrent jobs. Try again shortly." },
        { status: 429 }
      );
    }

    const body: GenerateRequest = await request.json();

    // Resolve content
    let content: string;
    let source: string;
    if (body.content) {
      content = body.content;
      source = "text";
    } else if (body.url) {
      content = await fetchUrl(body.url);
      source = "url";
    } else if (body.grimoire_path) {
      content = await fetchGrimoirePage(body.grimoire_path);
      source = "grimoire";
    } else {
      return NextResponse.json(
        { error: "Provide content, url, or grimoire_path" },
        { status: 400 }
      );
    }

    if (content.length < 50) {
      return NextResponse.json(
        { error: "Content too short (< 50 chars)" },
        { status: 400 }
      );
    }

    const voicePreset =
      VOICE_PRESETS[body.voices as keyof typeof VOICE_PRESETS] ||
      VOICE_PRESETS.luna_and_sol;

    const title =
      body.title ||
      body.url?.split("/").pop()?.replace(/-/g, " ") ||
      body.grimoire_path?.split("/").pop()?.replace(/-/g, " ") ||
      "Untitled Episode";

    const config: PodcastConfig = {
      content,
      title,
      format: body.format || "conversation",
      duration: body.duration || "5min",
      tone: body.tone || "educational",
      voices: voicePreset,
      ttsProvider: body.tts || "deepinfra",
      llmProvider: body.llm || "openrouter",
      includeMusic: body.includeMusic || false,
      customInstructions: body.instructions,
      source,
    };

    const job = await createJob();
    await updateJob(job.id, { config });

    // Async mode: return jobId immediately, caller triggers POST /process/:id
    if (body.async) {
      console.log(`[podify] Job ${job.id} created (async mode)`);
      return NextResponse.json({ jobId: job.id });
    }

    // Sync mode (default): run generation inline. The caller's HTTP connection
    // keeps the function alive for the full maxDuration (300s). Progress updates
    // are written to blob so concurrent status polling still works.
    const outputDir = process.env.VERCEL ? "/tmp/.podify-output" : ".podify-output";
    console.log(`[podify] Starting generation for job ${job.id}`);

    try {
      await updateJob(job.id, { status: "processing", message: "Starting..." });

      const result = await generateEpisode(config, outputDir, async (event) => {
        try {
          await updateJob(job.id, {
            status: "processing",
            stage: event.stage,
            message: event.message,
            progress: event.percent,
          });
        } catch (err) {
          console.error(`[podify] Failed to update progress for job ${job.id}:`, err);
        }
      });

      await updateJob(job.id, {
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

      return NextResponse.json({ jobId: job.id, status: "complete", result: {
        slug: result.slug,
        blobUrl: result.blobUrl,
        audioUrl: result.blobUrl || `/api/podcast/episodes/${result.slug}/audio`,
        transcript: result.transcript,
        durationSeconds: result.durationSeconds,
        wordCount: result.wordCount,
        costUsd: result.costUsd,
      }});
    } catch (err) {
      console.error(`[podify] Generation failed for job ${job.id}:`, err);
      const message = err instanceof Error ? err.message : String(err);
      await updateJob(job.id, { status: "error", message, error: message }).catch(() => {});
      return NextResponse.json({ jobId: job.id, status: "error", error: message }, { status: 500 });
    }
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
