import "dotenv/config";
import { NextResponse } from "next/server";
import { createJob, updateJob, isAtCapacity } from "@/lib/jobs";
import { generateEpisode } from "@/lib/pipeline";
import { fetchGrimoirePage, fetchUrl } from "@/lib/fetch-content";
import { PodcastConfig, VOICE_PRESETS } from "@/lib/types";

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
}

export async function POST(request: Request) {
  try {
    if (process.env.VERCEL) {
      return NextResponse.json(
        { error: "Generation requires ffmpeg — use the CLI locally" },
        { status: 501 }
      );
    }

    if (isAtCapacity()) {
      return NextResponse.json(
        { error: "Too many concurrent jobs. Try again shortly." },
        { status: 429 }
      );
    }

    const body: GenerateRequest = await request.json();

    // Resolve content
    let content: string;
    if (body.content) {
      content = body.content;
    } else if (body.url) {
      content = await fetchUrl(body.url);
    } else if (body.grimoire_path) {
      content = await fetchGrimoirePage(body.grimoire_path);
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
    };

    const job = createJob();

    // Fire-and-forget: start generation without awaiting
    const outputDir = ".podify-output";
    generateEpisode(config, outputDir, (event) => {
      updateJob(job.id, {
        status: "processing",
        stage: event.stage,
        message: event.message,
        progress: event.percent,
        ...(event.stage === "complete"
          ? { status: "complete" as const }
          : {}),
      });
    })
      .then((result) => {
        updateJob(job.id, {
          status: "complete",
          progress: 100,
          stage: "complete",
          message: "Episode complete!",
          result: {
            audioPath: result.audioPath,
            transcript: result.transcript,
            durationSeconds: result.durationSeconds,
            wordCount: result.wordCount,
            costUsd: result.costUsd,
          },
        });
      })
      .catch((err) => {
        updateJob(job.id, {
          status: "error",
          message: err.message,
          error: err.message,
        });
      });

    return NextResponse.json({ jobId: job.id });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
