// ============================================================
// Stage 2: TTS Generation
// Converts each script line into an audio clip using Kokoro
// ============================================================

import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { ScriptLine, AudioClip, PodcastConfig } from "@/lib/types";

export type ProgressCallback = (message: string, percent: number) => void;

// ============================================================
// Pronunciation fixes for words Kokoro TTS mispronounces
// Applied before sending to TTS — transcript keeps correct spelling
// ============================================================

const TTS_PRONUNCIATIONS: [RegExp, string][] = [
  [/\bgrimoire\b/gi, "grim-wahr"],
  [/\bgibbous\b/gi, "GIH-bus"],
  [/\bsamhain\b/gi, "sow-in"],
  [/\bmabon\b/gi, "may-bon"],
  [/\bimbolc\b/gi, "im-olk"],
  [/\blitha\b/gi, "lee-thah"],
  [/\bostara\b/gi, "oh-star-ah"],
  [/\bbeltane\b/gi, "bell-tayn"],
  [/\bathame\b/gi, "ah-thah-may"],
  [/\bdeosil\b/gi, "jess-ul"],
  [/\bwiddershins\b/gi, "wid-er-shinz"],
];

function prepareForTTS(text: string, provider: string): string {
  let result = text;
  for (const [pattern, replacement] of TTS_PRONUNCIATIONS) {
    result = result.replace(pattern, replacement);
  }
  // Strip Orpheus emotion tags for non-Orpheus providers (they'd be read literally)
  if (provider !== "orpheus") {
    result = result.replace(/<(?:laugh|chuckle|sigh|gasp|cough|sniffle|groan|yawn)>/gi, "");
  }
  return result;
}

// ============================================================
// TTS Provider: DeepInfra (Kokoro) — $0.62/1M chars
// ============================================================

async function ttsDeepInfra(
  text: string,
  voice: string,
  speed?: number
): Promise<{ audio: Buffer; durationMs: number }> {
  const apiKey = process.env.DEEPINFRA_API_KEY;
  if (!apiKey) throw new Error("DEEPINFRA_API_KEY not set");

  const body: Record<string, unknown> = {
    model: "hexgrad/Kokoro-82M",
    input: text,
    voice,
    response_format: "mp3",
  };
  if (speed !== undefined) body.speed = speed;

  const res = await fetch("https://api.deepinfra.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`DeepInfra TTS error ${res.status}: ${err}`);
  }

  const audioBuffer = Buffer.from(await res.arrayBuffer());
  const estimatedDurationMs = (text.length / 1000) * 60 * 1000;

  return { audio: audioBuffer, durationMs: estimatedDurationMs };
}

// ============================================================
// TTS Provider: Orpheus (via DeepInfra) — expressive, LLM-based
// ============================================================

async function ttsOrpheus(
  text: string,
  voice: string,
  speed?: number
): Promise<{ audio: Buffer; durationMs: number }> {
  const apiKey = process.env.DEEPINFRA_API_KEY;
  if (!apiKey) throw new Error("DEEPINFRA_API_KEY not set");

  const body: Record<string, unknown> = {
    model: "canopylabs/orpheus-3b-0.1-ft",
    input: text,
    voice,
    response_format: "mp3",
  };
  if (speed !== undefined) body.speed = speed;

  const res = await fetch("https://api.deepinfra.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Orpheus TTS error ${res.status}: ${err}`);
  }

  const audioBuffer = Buffer.from(await res.arrayBuffer());
  const estimatedDurationMs = (text.length / 1000) * 60 * 1000;

  return { audio: audioBuffer, durationMs: estimatedDurationMs };
}

// ============================================================
// TTS Provider: inference.sh (Kokoro)
// ============================================================

async function ttsInference(
  text: string,
  voice: string,
  speed?: number
): Promise<{ audio: Buffer; durationMs: number }> {
  const apiKey = process.env.INFERENCE_API_KEY;
  if (!apiKey) throw new Error("INFERENCE_API_KEY not set");

  const input: Record<string, unknown> = { text, voice };
  if (speed !== undefined) input.speed = speed;

  const res = await fetch("https://api.inference.sh/v1/run", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      app: "infsh/kokoro-tts",
      input,
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
  voice: string,
  speed?: number
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
      ...(speed !== undefined && { speed }),
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
    config.ttsProvider === "orpheus"
      ? ttsOrpheus
      : config.ttsProvider === "deepinfra"
        ? ttsDeepInfra
        : config.ttsProvider === "openai"
          ? ttsOpenAI
          : ttsInference;

  const CONCURRENCY = 6;

  console.log(`🔊 Generating ${script.length} audio clips (concurrency: ${CONCURRENCY})...`);
  console.log(`   TTS provider: ${config.ttsProvider}`);
  console.log(`   HOST_A voice: ${config.voices.host_a.id} (${config.voices.host_a.name})`);
  console.log(`   HOST_B voice: ${config.voices.host_b?.id || "MISSING — falling back to HOST_A!"} (${config.voices.host_b?.name || "N/A"})`);

  // Prepare all clip tasks up front
  const clipResults: (AudioClip | null)[] = new Array(script.length).fill(null);
  let totalChars = 0;
  let completed = 0;

  // Process clips in parallel batches
  const pending = new Set<Promise<void>>();

  for (let i = 0; i < script.length; i++) {
    const task = (async (idx: number) => {
      const line = script[idx];
      const voiceConfig =
        line.speaker === "HOST_A"
          ? config.voices.host_a
          : config.voices.host_b || config.voices.host_a;
      const voiceId = voiceConfig.id;
      const voiceSpeed = voiceConfig.speed;

      const fileName = `clip_${String(idx).padStart(3, "0")}_${line.speaker}.mp3`;
      const filePath = join(clipsDir, fileName);

      try {
        // Add subtle speed variation (±5%) for more natural rhythm
        const jitter = 0.95 + Math.random() * 0.10; // 0.95 to 1.05
        const effectiveSpeed = (voiceSpeed ?? 1.0) * jitter;
        const roundedSpeed = Math.round(effectiveSpeed * 100) / 100;
        console.log(`   [clip ${idx}] ${line.speaker} → voice: ${voiceId} speed: ${roundedSpeed}`);
        const ttsText = prepareForTTS(line.text, config.ttsProvider);
        const { audio, durationMs } = await ttsFunc(ttsText, voiceId, roundedSpeed);
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
    orpheus: 1.0,
    inference: 1.0,
    openai: 15.0,
  };
  const cost = (totalChars / 1_000_000) * (costPerMChar[config.ttsProvider] || 1);
  console.log(`   💰 Estimated TTS cost: $${cost.toFixed(4)}`);

  onProgress?.(`Audio generated: ${clips.length} clips`, 80);

  return clips;
}
