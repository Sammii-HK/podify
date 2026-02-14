// ============================================================
// Feed Manifest — persistent episode registry
// ============================================================

import { readFile, writeFile, stat, readdir } from "fs/promises";
import { join, basename } from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { randomUUID } from "crypto";
import { EpisodeMeta, FeedManifest, ShowConfig } from "@/lib/types";

const execFileAsync = promisify(execFile);

const DEFAULT_SHOW: ShowConfig = {
  title: "Podify Podcast",
  description: "AI-generated podcast episodes",
  link: "https://example.com",
  language: "en",
  author: "Podify",
  email: "podcast@example.com",
  imageUrl: "",
  category: "Education",
  explicit: false,
};

// ============================================================
// Read / write manifest
// ============================================================

export async function readManifest(outputDir: string): Promise<FeedManifest> {
  const feedPath = join(outputDir, "feed.json");
  try {
    const raw = await readFile(feedPath, "utf-8");
    return JSON.parse(raw) as FeedManifest;
  } catch {
    return { show: { ...DEFAULT_SHOW }, episodes: [] };
  }
}

async function writeManifest(
  outputDir: string,
  manifest: FeedManifest
): Promise<void> {
  const feedPath = join(outputDir, "feed.json");
  await writeFile(feedPath, JSON.stringify(manifest, null, 2));
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
  await writeManifest(outputDir, manifest);
}

// ============================================================
// Rebuild feed from disk (for bootstrapping)
// ============================================================

async function getAudioDuration(filePath: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
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
