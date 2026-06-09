// ============================================================
// Stage 2: TTS Generation
// Converts each script line into an audio clip using Kokoro
// ============================================================

import { writeFile, mkdir, copyFile } from "fs/promises";
import { createHash } from "crypto";
import { join, isAbsolute } from "path";
import { ScriptLine, AudioClip, PodcastConfig } from "@/lib/types";

export type ProgressCallback = (message: string, percent: number) => void;

type TTSResult = {
  audio?: Buffer;
  audioPath?: string;
  durationMs: number;
  voiceLabel?: string;
};

type TTSFunction = (
  text: string,
  voice: string,
  speed?: number,
  seed?: string
) => Promise<TTSResult>;

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
// TTS Provider: Voicebox (local Kokoro) — free on the Mini
// ============================================================

const VOICEBOX_DEFAULT_URL = "http://127.0.0.1:8880";
const VOICEBOX_DEFAULT_DATA_DIR = join(
  process.env.HOME ?? "/Users/sammii",
  "Library/Application Support/sh.voicebox.app"
);
const VOICEBOX_PROFILE_MAP: Record<string, string> = {
  af_heart: "lunary-kokoro-heart",
  af_sarah: "lunary-kokoro-sarah",
  af_aoede: "lunary-kokoro-sarah",
  af_bella: "lunary-kokoro-bella",
  af_sky: "lunary-kokoro-sky",
};

function csvEnv(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function stableIndex(seed: string, size: number): number {
  const digest = createHash("sha256").update(seed).digest();
  return digest.readUInt32BE(0) % size;
}

function selectVoiceboxProfile(voice: string, seed: string): {
  endpoint: "/generate" | "/speak";
  body: Record<string, unknown>;
  label: string;
} {
  const profileIds = csvEnv("VOICEBOX_PROFILE_IDS");
  if (profileIds.length > 0) {
    const profileId = profileIds[stableIndex(seed, profileIds.length)];
    return {
      endpoint: "/generate",
      body: { profile_id: profileId },
      label: `profile_id:${profileId}`,
    };
  }

  const profiles = csvEnv("VOICEBOX_PROFILES");
  const profile = profiles.length > 0
    ? profiles[stableIndex(seed, profiles.length)]
    : (VOICEBOX_PROFILE_MAP[voice] ?? voice);

  return {
    endpoint: "/speak",
    body: { profile },
    label: `profile:${profile}`,
  };
}

async function voiceboxJson(baseUrl: string, endpoint: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const res = await fetch(`${baseUrl}${endpoint}`, init);
  if (!res.ok) {
    throw new Error(`Voicebox ${endpoint} ${res.status}: ${await res.text()}`);
  }
  return await res.json() as Record<string, unknown>;
}

async function waitForVoiceboxGeneration(baseUrl: string, generationId: string): Promise<Record<string, unknown>> {
  const timeoutMs = Number(process.env.VOICEBOX_GENERATION_TIMEOUT_MS ?? "240000");
  const pollMs = Number(process.env.VOICEBOX_GENERATION_POLL_MS ?? "1000");
  const deadline = Date.now() + timeoutMs;
  let last: Record<string, unknown> | undefined;

  while (Date.now() < deadline) {
    const payload = await voiceboxJson(baseUrl, `/history/${generationId}`);
    last = payload;
    const status = String(payload.status ?? "");
    if (["completed", "failed", "cancelled", "canceled"].includes(status)) {
      if (status !== "completed") {
        throw new Error(`Voicebox generation ${generationId} ${status}: ${payload.error ?? "no error detail"}`);
      }
      return payload;
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }

  throw new Error(`Voicebox generation ${generationId} timed out after ${timeoutMs}ms; last=${JSON.stringify(last ?? {})}`);
}

function resolveVoiceboxAudioPath(audioPath: string): string {
  if (isAbsolute(audioPath)) return audioPath;
  const dataDir = process.env.VOICEBOX_DATA_DIR ?? VOICEBOX_DEFAULT_DATA_DIR;
  return join(dataDir, audioPath);
}

async function writeVoiceboxAudio(audioPath: string, filePath: string): Promise<void> {
  if (/^https?:\/\//i.test(audioPath)) {
    const audioRes = await fetch(audioPath);
    if (!audioRes.ok) {
      throw new Error(`Voicebox audio download ${audioRes.status}: ${await audioRes.text()}`);
    }
    await writeFile(filePath, Buffer.from(await audioRes.arrayBuffer()));
    return;
  }

  await copyFile(resolveVoiceboxAudioPath(audioPath), filePath);
}

async function ttsVoicebox(
  text: string,
  voice: string,
  speed?: number,
  seed = text
): Promise<TTSResult> {
  const baseUrl = (process.env.VOICEBOX_BASE_URL ?? VOICEBOX_DEFAULT_URL).replace(/\/+$/, "");
  const selectedProfile = selectVoiceboxProfile(voice, seed);
  const engine = process.env.VOICEBOX_ENGINE?.trim();
  const language = process.env.VOICEBOX_LANGUAGE?.trim() || "en";
  const body: Record<string, unknown> = {
    text,
    language,
    ...selectedProfile.body,
  };

  if (engine) body.engine = engine;
  if (speed !== undefined) body.speed = speed;

  const payload = await voiceboxJson(baseUrl, selectedProfile.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Voicebox-Client-Id": "podify",
    },
    body: JSON.stringify(body),
  });

  const payloadStatus = String(payload.status ?? "");
  const data = payload.id && ["", "queued", "generating", "pending"].includes(payloadStatus)
    ? await waitForVoiceboxGeneration(baseUrl, String(payload.id))
    : payload;

  const audioPath = data.audio_path ?? data.audioPath ?? data.path ?? data.file;
  if (!audioPath) {
    throw new Error("Voicebox TTS response did not include an audio path");
  }

  const estimatedDurationMs = (text.length / 1000) * 60 * 1000;
  return {
    audioPath: String(audioPath),
    durationMs: estimatedDurationMs,
    voiceLabel: selectedProfile.label,
  };
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

  const paidFallbackEnabled = process.env.PODIFY_TTS_PAID_FALLBACK === "1";
  const configuredProvider = config.ttsProvider || "voicebox";
  const ttsFunc: TTSFunction =
    configuredProvider === "voicebox"
      ? ttsVoicebox
      : configuredProvider === "orpheus"
      ? ttsOrpheus
      : configuredProvider === "deepinfra"
        ? ttsDeepInfra
        : configuredProvider === "openai"
          ? ttsOpenAI
          : ttsInference;

  const CONCURRENCY = configuredProvider === "voicebox"
    ? Number(process.env.VOICEBOX_CONCURRENCY ?? "2")
    : 6;

  console.log(`🔊 Generating ${script.length} audio clips (concurrency: ${CONCURRENCY})...`);
  console.log(`   TTS provider: ${configuredProvider}`);
  if (configuredProvider === "voicebox") {
    console.log(`   Voicebox URL: ${process.env.VOICEBOX_BASE_URL ?? VOICEBOX_DEFAULT_URL}`);
    console.log(`   Paid fallback: ${paidFallbackEnabled ? "enabled" : "disabled"}`);
  }
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
      const jitter = 0.95 + Math.random() * 0.10; // 0.95 to 1.05
      const effectiveSpeed = (voiceSpeed ?? 1.0) * jitter;
      const roundedSpeed = Math.round(effectiveSpeed * 100) / 100;

      try {
        // Add subtle speed variation (±5%) for more natural rhythm
        console.log(`   [clip ${idx}] ${line.speaker} → voice: ${voiceId} speed: ${roundedSpeed}`);
        const ttsText = prepareForTTS(line.text, configuredProvider);
        const seed = `${line.speaker}:${idx}:${voiceId}:${ttsText}`;
        const result = await ttsFunc(ttsText, voiceId, roundedSpeed, seed);
        if (configuredProvider === "voicebox" && result.voiceLabel) {
          console.log(`   [clip ${idx}] Voicebox ${result.voiceLabel}`);
        }
        if (configuredProvider === "voicebox" && result.audioPath) {
          await writeVoiceboxAudio(result.audioPath, filePath);
        } else if (result.audio) {
          await writeFile(filePath, result.audio);
        } else {
          throw new Error("TTS provider returned no audio");
        }

        clipResults[idx] = { speaker: line.speaker, filePath, durationMs: result.durationMs };
        totalChars += line.text.length;
      } catch (err) {
        if (configuredProvider === "voicebox" && paidFallbackEnabled) {
          try {
            console.warn(`\n   ⚠️  Voicebox failed on clip ${idx}; trying paid DeepInfra fallback: ${(err as Error).message}`);
            const ttsText = prepareForTTS(line.text, "deepinfra");
            const { audio, durationMs } = await ttsDeepInfra(ttsText, voiceId, roundedSpeed);
            await writeFile(filePath, audio);
            clipResults[idx] = { speaker: line.speaker, filePath, durationMs };
            totalChars += line.text.length;
          } catch (fallbackErr) {
            console.error(`\n   ⚠️  Paid fallback also failed on clip ${idx} (${line.speaker}): ${(fallbackErr as Error).message}`);
          }
        } else {
          console.error(`\n   ⚠️  Failed on clip ${idx} (${line.speaker}): ${(err as Error).message}`);
        }
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
    voicebox: 0,
  };
  const cost = (totalChars / 1_000_000) * (costPerMChar[configuredProvider] ?? 1);
  console.log(`   💰 Estimated TTS cost: $${cost.toFixed(4)}`);

  onProgress?.(`Audio generated: ${clips.length} clips`, 80);

  return clips;
}
