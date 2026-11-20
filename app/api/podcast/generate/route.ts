import "dotenv/config";
import { resolvePrincipal, jobOwner, privateJson } from "@/lib/job-access";
import { createJob, updateJob, isAtCapacity } from "@/lib/jobs";
import { generateEpisode } from "@/lib/pipeline";
import { fetchGrimoirePage, fetchUrl } from "@/lib/fetch-content";
import { PodcastConfig, VOICE_PRESETS } from "@/lib/types";
import { checkAndConsumeQuota } from "@/lib/device-keys";

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
  source?: string; // Override auto-detected source ("grimoire", "url", "text")
  async?: boolean; // If true, returns jobId immediately (caller must POST /process/:id)
}

export async function POST(request: Request) {
  try {
    const principal = await resolvePrincipal(request);
    if (!principal) return privateJson({ error: "Unauthorized" }, { status: 401 });
    if (await isAtCapacity()) {
      return privateJson(
        { error: "Too many concurrent jobs. Try again shortly." },
        { status: 429 }
      );
    }

    // Per-device quota gate. Only applies to requests authenticated via a
    // device key (mobile app installs) — the shared password/session and
    // static API_KEY paths (owner's own CLI/browser use) are unmetered,
    // Operator credentials take precedence if a client also supplies a device key.
    if (principal.kind === "device") {
      const quota = await checkAndConsumeQuota(principal.key);
      if (!quota) {
        return privateJson(
          { error: "Invalid or unrecognized device key" },
          { status: 401 }
        );
      }
      if (!quota.ok) {
        return privateJson(
          {
            error: `Monthly generation limit reached (${quota.limit}/month). Try again next month, or upgrade for unlimited generations.`,
            limit: quota.limit,
            remaining: quota.remaining,
          },
          { status: 429 }
        );
      }
    }

    const body: GenerateRequest = await request.json();

    // Resolve content
    let content: string;
    let detectedSource: string;
    if (body.content) {
      content = body.content;
      detectedSource = "text";
    } else if (body.url) {
      content = await fetchUrl(body.url);
      detectedSource = "url";
    } else if (body.grimoire_path) {
      content = await fetchGrimoirePage(body.grimoire_path);
      detectedSource = "grimoire";
    } else {
      return privateJson(
        { error: "Provide content, url, or grimoire_path" },
        { status: 400 }
      );
    }

    if (content.length < 50) {
      return privateJson(
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
      ttsProvider: body.tts || "voicebox",
      llmProvider: body.llm || "ollama",
      includeMusic: body.includeMusic || false,
      customInstructions: body.instructions,
      source: body.source || detectedSource,
    };

    const job = await createJob(jobOwner(principal));
    await updateJob(job.id, { config });

    // Async mode: return jobId immediately, caller triggers POST /process/:id
    if (body.async) {
      console.log(`[podify] Job ${job.id} created (async mode)`);
      return privateJson({ jobId: job.id });
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

      return privateJson({ jobId: job.id, status: "complete", result: {
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
      return privateJson({ jobId: job.id, status: "error", error: message }, { status: 500 });
    }
  } catch (err) {
    console.error("[podify] Generation request failed", err);
    return privateJson(
      { error: "Generation request failed" },
      { status: 500 }
    );
  }
}
