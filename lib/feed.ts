// ============================================================
// Feed Manifest — persistent episode registry
// ============================================================

import { readFile, stat, readdir } from "fs/promises";
import { join } from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { randomUUID } from "crypto";
import { EpisodeMeta, FeedManifest } from "@/lib/types";
import { path as ffprobePath } from "ffprobe-static";
import {
  readManifestFromStore,
  writeManifestToStore,
  isUsingBlob,
  uploadEpisodeAudio,
  deleteEpisodeAudio,
} from "@/lib/storage";

const execFileAsync = promisify(execFile);

const MAX_EPISODES = parseInt(process.env.MAX_EPISODES || "60", 10);

// ============================================================
// Read / write manifest
// ============================================================

export async function readManifest(outputDir: string): Promise<FeedManifest> {
  return readManifestFromStore(outputDir);
}

async function writeManifest(
  outputDir: string,
  manifest: FeedManifest
): Promise<void> {
  return writeManifestToStore(outputDir, manifest);
}

// ============================================================
// Add episode (idempotent — skips if slug exists)
// ============================================================

export async function addEpisodeToManifest(
  outputDir: string,
  episode: EpisodeMeta
): Promise<void> {
  const manifest = await readManifest(outputDir);

  // Handle slug collisions: if slug already exists, append -2, -3, etc.
  let finalSlug = episode.slug;
  const existingSlugs = new Set(manifest.episodes.map((e) => e.slug));
  if (existingSlugs.has(finalSlug)) {
    let suffix = 2;
    while (existingSlugs.has(`${episode.slug}-${suffix}`)) {
      suffix++;
    }
    finalSlug = `${episode.slug}-${suffix}`;
  }

  // Prepend (newest first)
  manifest.episodes.unshift({ ...episode, slug: finalSlug });

  // Auto-prune: keep only MAX_EPISODES
  if (manifest.episodes.length > MAX_EPISODES) {
    const pruned = manifest.episodes.splice(MAX_EPISODES);
    if (isUsingBlob()) {
      for (const old of pruned) {
        if (old.blobUrl) {
          try {
            await deleteEpisodeAudio(old.blobUrl);
            console.log(`   Pruned from blob: ${old.slug}`);
          } catch {
            // Best-effort deletion
          }
        }
      }
    }
  }

  await writeManifest(outputDir, manifest);
}

// ============================================================
// Rebuild feed from disk (for bootstrapping)
// ============================================================

async function getAudioDuration(filePath: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync(ffprobePath, [
      "-v",
      "quiet",
      "-print_format",
      "json",
      "-show_format",
      filePath,
    ]);
    const data = JSON.parse(stdout);
    return parseFloat(data.format?.duration || "0");
  } catch {
    return 0;
  }
}

export async function rebuildFeedManifest(outputDir: string): Promise<void> {
  const manifest = await readManifest(outputDir);
  const existingSlugs = new Set(manifest.episodes.map((e) => e.slug));

  const entries = await readdir(outputDir, { withFileTypes: true });
  const episodeDirs = entries
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const dir of episodeDirs) {
    const dirPath = join(outputDir, dir.name);

    // Find the MP3 file
    const files = await readdir(dirPath);
    const mp3File = files.find((f) => f.endsWith(".mp3"));
    if (!mp3File) continue;

    const slug = mp3File.replace(/\.mp3$/, "");

    // Skip if already in manifest
    if (existingSlugs.has(slug)) continue;

    const mp3Path = join(dirPath, mp3File);
    const mp3Stat = await stat(mp3Path);
    const durationSeconds = await getAudioDuration(mp3Path);

    // Try to read transcript for word count
    let wordCount = 0;
    let description = "";
    try {
      const transcript = await readFile(join(dirPath, "transcript.txt"), "utf-8");
      wordCount = transcript.split(/\s+/).filter(Boolean).length;
      // Use first ~200 chars of transcript as description fallback
      description = transcript.slice(0, 200).replace(/\n/g, " ").trim();
      if (description.length === 200) description += "...";
    } catch {
      // No transcript available
    }

    // Parse date from dir name (format: YYYY-MM-DD_slug)
    const dateMatch = dir.name.match(/^(\d{4}-\d{2}-\d{2})_/);
    const pubDate = dateMatch
      ? new Date(dateMatch[1]).toISOString()
      : mp3Stat.mtime.toISOString();

    // Parse title from slug
    const title = slug
      .replace(/-/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());

    const episode: EpisodeMeta = {
      guid: randomUUID(),
      slug,
      dirName: dir.name,
      title,
      description,
      pubDate,
      durationSeconds,
      fileSizeBytes: mp3Stat.size,
      audioFileName: mp3File,
      wordCount,
      costUsd: 0,
    };

    // Upload to blob if configured
    if (isUsingBlob()) {
      try {
        const mp3Buffer = await readFile(mp3Path);
        episode.blobUrl = await uploadEpisodeAudio(slug, mp3Buffer);
        console.log(`   Uploaded to blob: ${slug}`);
      } catch (err) {
        console.warn(`   Failed to upload ${slug} to blob: ${(err as Error).message}`);
      }
    }

    manifest.episodes.unshift(episode);
    existingSlugs.add(slug);
    console.log(`   Added: ${dir.name} (${slug})`);
  }

  // Sort newest first
  manifest.episodes.sort(
    (a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime()
  );

  await writeManifest(outputDir, manifest);
  console.log(`\n   Feed manifest written with ${manifest.episodes.length} episodes`);
}
