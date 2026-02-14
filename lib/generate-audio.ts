// ============================================================
// Stage 2: TTS Generation
// Converts each script line into an audio clip using Kokoro
// ============================================================

import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { ScriptLine, AudioClip, PodcastConfig } from "@/lib/types";

export type ProgressCallback = (message: string, percent: number) => void;

// ============================================================
// TTS Provider: DeepInfra (Kokoro) — $0.62/1M chars
// ============================================================

async function ttsDeepInfra(
  text: string,
  voice: string
): Promise<{ audio: Buffer; durationMs: number }> {
  const apiKey = process.env.DEEPINFRA_API_KEY;
  if (!apiKey) throw new Error("DEEPINFRA_API_KEY not set");

  const res = await fetch(
    "https://api.deepinfra.com/v1/inference/hexgrad/Kokoro-82M",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        voice,
        output_format: "wav",
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`DeepInfra TTS error ${res.status}: ${err}`);
  }

  const contentType = res.headers.get("content-type") || "";
  let audioBuffer: Buffer;

  if (contentType.includes("audio/")) {
    // Direct binary audio response
    audioBuffer = Buffer.from(await res.arrayBuffer());
  } else {
    // JSON response with audio data
    const data = await res.json();
    if (data.audio) {
      // Strip data URI prefix if present
      const b64 = typeof data.audio === "string" && data.audio.includes(",")
        ? data.audio.split(",")[1]
        : data.audio;
      audioBuffer = Buffer.from(b64, "base64");
    } else if (data.output?.audio) {
      const b64 = typeof data.output.audio === "string" && data.output.audio.includes(",")
        ? data.output.audio.split(",")[1]
        : data.output.audio;
      audioBuffer = Buffer.from(b64, "base64");
    } else if (data.output?.url) {
      const audioRes = await fetch(data.output.url);
      audioBuffer = Buffer.from(await audioRes.arrayBuffer());
    } else {
      throw new Error("Unexpected DeepInfra response format");
    }
  }

  // Estimate duration: ~1000 chars = 1 minute
  const estimatedDurationMs = (text.length / 1000) * 60 * 1000;

  return { audio: audioBuffer, durationMs: estimatedDurationMs };
}

// ============================================================
// TTS Provider: inference.sh (Kokoro)
// ============================================================

async function ttsInference(
  text: string,
  voice: string
): Promise<{ audio: Buffer; durationMs: number }> {
  const apiKey = process.env.INFERENCE_API_KEY;
  if (!apiKey) throw new Error("INFERENCE_API_KEY not set");

  const res = await fetch("https://api.inference.sh/v1/run", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      app: "infsh/kokoro-tts",
      input: { text, voice },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`inference.sh TTS error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const audioUrl = data.output?.audio_url || data.output?.url;

  if (!audioUrl) {
    throw new Error("No audio URL in inference.sh response");
  }

  const audioRes = await fetch(audioUrl);
  const audioBuffer = Buffer.from(await audioRes.arrayBuffer());
  const estimatedDurationMs = (text.length / 1000) * 60 * 1000;

  return { audio: audioBuffer, durationMs: estimatedDurationMs };
}

// ============================================================
// TTS Provider: OpenAI (fallback, higher quality, higher cost)
// ============================================================

async function ttsOpenAI(
  text: string,
  voice: string
): Promise<{ audio: Buffer; durationMs: number }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");

  // Map Kokoro voice IDs to OpenAI voice names
  const voiceMap: Record<string, string> = {
    af_heart: "nova",
    af_sarah: "shimmer",
    am_michael: "echo",
    am_adam: "onyx",
    bf_emma: "fable",
    bm_george: "alloy",
  };

  const openaiVoice = voiceMap[voice] || "nova";

  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "tts-1",
      voice: openaiVoice,
      input: text,
      response_format: "mp3",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI TTS error ${res.status}: ${err}`);
  }

  const audioBuffer = Buffer.from(await res.arrayBuffer());
  const estimatedDurationMs = (text.length / 1000) * 60 * 1000;

  return { audio: audioBuffer, durationMs: estimatedDurationMs };
}

// ============================================================
// Main export
// ============================================================

export async function generateAudio(
  script: ScriptLine[],
  config: PodcastConfig,
  workDir: string,
  onProgress?: ProgressCallback
): Promise<AudioClip[]> {
  const clipsDir = join(workDir, "clips");
  await mkdir(clipsDir, { recursive: true });

  const ttsFunc =
    config.ttsProvider === "deepinfra"
      ? ttsDeepInfra
      : config.ttsProvider === "openai"
        ? ttsOpenAI
        : ttsInference;

  const CONCURRENCY = 6;

  console.log(`🔊 Generating ${script.length} audio clips (concurrency: ${CONCURRENCY})...`);
  console.log(`   TTS provider: ${config.ttsProvider}`);

  // Prepare all clip tasks up front
  const clipResults: (AudioClip | null)[] = new Array(script.length).fill(null);
  let totalChars = 0;
  let completed = 0;

  // Process clips in parallel batches
  const pending = new Set<Promise<void>>();

  for (let i = 0; i < script.length; i++) {
    const task = (async (idx: number) => {
      const line = script[idx];
      const voiceId =
        line.speaker === "HOST_A"
          ? config.voices.host_a.id
          : config.voices.host_b?.id || config.voices.host_a.id;

      const fileName = `clip_${String(idx).padStart(3, "0")}_${line.speaker}.mp3`;
      const filePath = join(clipsDir, fileName);

      try {
        const { audio, durationMs } = await ttsFunc(line.text, voiceId);
        await writeFile(filePath, audio);

        clipResults[idx] = { speaker: line.speaker, filePath, durationMs };
        totalChars += line.text.length;
      } catch (err) {
        console.error(`\n   ⚠️  Failed on clip ${idx} (${line.speaker}): ${(err as Error).message}`);
      }

      completed++;
      const pct = Math.round((completed / script.length) * 100);
      process.stdout.write(`\r   Progress: ${pct}% (${completed}/${script.length})`);
      const overallPct = 30 + Math.round((completed / script.length) * 50);
      onProgress?.(`Generating audio clip ${completed}/${script.length}`, overallPct);
    })(i);

    pending.add(task);
    task.then(() => pending.delete(task));

    // Wait when we hit the concurrency limit
    if (pending.size >= CONCURRENCY) {
      await Promise.race(pending);
    }
  }

  // Wait for remaining tasks
  await Promise.all(pending);

  // Collect successful clips in order
  const clips: AudioClip[] = clipResults.filter((c): c is AudioClip => c !== null);

  console.log(`\n   ✅ Generated ${clips.length} clips (${totalChars} chars)`);

  // Cost estimate
  const costPerMChar: Record<string, number> = {
    deepinfra: 0.62,
    inference: 1.0, // approximate
    openai: 15.0,
  };
  const cost = (totalChars / 1_000_000) * (costPerMChar[config.ttsProvider] || 1);
  console.log(`   💰 Estimated TTS cost: $${cost.toFixed(4)}`);

  onProgress?.(`Audio generated: ${clips.length} clips`, 80);

  return clips;
}
