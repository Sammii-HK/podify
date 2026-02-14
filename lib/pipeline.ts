// ============================================================
// Shared Pipeline — used by both CLI and API
// ============================================================

import { mkdir, writeFile, readFile, stat, rm } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";
import { generateScript, generateEpisodeDescription } from "@/lib/generate-script";
import { generateAudio } from "@/lib/generate-audio";
import { assemblePodcast } from "@/lib/assemble-podcast";
import { addEpisodeToManifest } from "@/lib/feed";
import { isUsingBlob, uploadEpisodeAudio } from "@/lib/storage";
import { PodcastConfig, PodcastResult, EpisodeMeta } from "@/lib/types";

export interface ProgressEvent {
  stage: "scripting" | "audio" | "assembly" | "complete";
  message: string;
  percent: number;
}

export type OnProgress = (event: ProgressEvent) => void | Promise<void>;

export async function generateEpisode(
  config: PodcastConfig,
  outputDir: string,
  onProgress?: OnProgress
): Promise<PodcastResult> {
  const startTime = Date.now();
  const timestamp = new Date().toISOString().slice(0, 10);
  const slugBase = config.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 50);
  const slug = `${slugBase}-${randomUUID().slice(0, 6)}`;

  const episodeDir = join(outputDir, `${timestamp}_${slug}`);
  const workDir = join(episodeDir, ".work");
  await mkdir(workDir, { recursive: true });

  console.log(`\n${"=".repeat(60)}`);
  console.log(`🎙️  PODCAST GENERATOR`);
  console.log(`${"=".repeat(60)}`);
  console.log(`   Title: ${config.title}`);
  console.log(`   Format: ${config.format}`);
  console.log(`   Duration: ${config.duration}`);
  console.log(`   Tone: ${config.tone}`);
  console.log(`   Content: ${config.content.length} chars`);
  console.log(`${"=".repeat(60)}\n`);

  // Stage 1: Generate script
  await onProgress?.({ stage: "scripting", message: "Generating script...", percent: 0 });

  const script = await generateScript(config, (msg, pct) => {
    Promise.resolve(onProgress?.({ stage: "scripting", message: msg, percent: pct })).catch(() => {});
  });

  // Save transcript
  await writeFile(join(episodeDir, "transcript.json"), JSON.stringify(script, null, 2));

  const readableTranscript = script
    .map((line) => {
      const name =
        line.speaker === "HOST_A"
          ? config.voices.host_a.name
          : config.voices.host_b?.name || "Host B";
      return `${name}: ${line.text}`;
    })
    .join("\n\n");
  await writeFile(join(episodeDir, "transcript.txt"), readableTranscript);

  // Stage 2: Generate audio clips
  await onProgress?.({ stage: "audio", message: "Generating audio clips...", percent: 30 });

  const clips = await generateAudio(script, config, workDir, (msg, pct) => {
    Promise.resolve(onProgress?.({ stage: "audio", message: msg, percent: pct })).catch(() => {});
  });

  if (clips.length === 0) {
    throw new Error("No audio clips generated — check TTS provider config");
  }

  // Stage 3: Assemble final podcast
  await onProgress?.({ stage: "assembly", message: "Assembling podcast...", percent: 80 });

  const outputPath = join(episodeDir, `${slug}.mp3`);
  const { durationSeconds } = await assemblePodcast(
    clips,
    config,
    workDir,
    outputPath,
    (msg, pct) => {
      Promise.resolve(onProgress?.({ stage: "assembly", message: msg, percent: pct })).catch(() => {});
    }
  );

  // Calculate costs
  const totalChars = script.reduce((sum, l) => sum + l.text.length, 0);
  const wordCount = script.reduce(
    (sum, l) => sum + l.text.split(/\s+/).length,
    0
  );

  const ttsCostPerMChar: Record<string, number> = {
    deepinfra: 0.62,
    inference: 1.0,
    openai: 15.0,
  };
  const ttsCost =
    (totalChars / 1_000_000) * (ttsCostPerMChar[config.ttsProvider] || 1);
  const llmCost = 0.03;
  const totalCost = ttsCost + llmCost;

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`\n${"=".repeat(60)}`);
  console.log(`✅ EPISODE COMPLETE`);
  console.log(`${"=".repeat(60)}`);
  console.log(`   📁 Output: ${episodeDir}/`);
  console.log(`   🎵 Audio: ${slug}.mp3`);
  console.log(`   📝 Transcript: transcript.txt`);
  console.log(`   ⏱️  Duration: ${Math.floor(durationSeconds / 60)}m ${Math.round(durationSeconds % 60)}s`);
  console.log(`   📊 Words: ${wordCount}`);
  console.log(`   💰 Cost: $${totalCost.toFixed(4)}`);
  console.log(`   🕐 Generated in: ${elapsed}s`);
  console.log(`${"=".repeat(60)}\n`);

  // Register episode in feed manifest
  let episodeBlobUrl: string | undefined;
  let description = "";
  try {
    description = await generateEpisodeDescription(
      config.title,
      script,
      config.llmProvider
    );
  } catch (err) {
    console.warn(`   ⚠️  Failed to generate description: ${(err as Error).message}`);
    description = script
      .map((l) => l.text)
      .join(" ")
      .slice(0, 200);
    if (description.length === 200) description += "...";
  }

  try {
    const mp3Stat = await stat(outputPath);
    const dirName = `${timestamp}_${slug}`;

    const episode: EpisodeMeta = {
      guid: randomUUID(),
      slug,
      dirName,
      title: config.title,
      description,
      pubDate: new Date().toISOString(),
      durationSeconds,
      fileSizeBytes: mp3Stat.size,
      audioFileName: `${slug}.mp3`,
      wordCount,
      costUsd: totalCost,
      source: config.source,
    };

    // Upload MP3 to Vercel Blob if configured
    if (isUsingBlob()) {
      try {
        const mp3Buffer = await readFile(outputPath);
        episode.blobUrl = await uploadEpisodeAudio(slug, mp3Buffer);
        episodeBlobUrl = episode.blobUrl;
        console.log(`   Uploaded to Vercel Blob: ${episode.blobUrl}`);
      } catch (err) {
        console.error(`   ❌ Blob upload failed: ${(err as Error).message}`);
      }
    }

    await addEpisodeToManifest(outputDir, episode);
    console.log(`   📡 Added to feed manifest`);
  } catch (err) {
    console.error(`   ❌ Failed to register episode: ${(err as Error).message}`);
    console.error(err);
  }

  // Clean up .work/ directory (~45MB per episode)
  try {
    await rm(workDir, { recursive: true });
    console.log(`   🧹 Cleaned up .work/ directory`);
  } catch {
    // Non-fatal — .work/ cleanup is best-effort
  }

  await onProgress?.({ stage: "complete", message: "Episode complete!", percent: 100 });

  return {
    audioPath: outputPath,
    slug,
    blobUrl: episodeBlobUrl,
    transcript: script,
    durationSeconds,
    wordCount,
    costUsd: totalCost,
  };
}
