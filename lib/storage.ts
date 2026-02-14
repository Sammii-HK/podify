// ============================================================
// Storage abstraction — Vercel Blob vs local filesystem
// ============================================================

import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import { put, del, list } from "@vercel/blob";
import { FeedManifest, ShowConfig } from "@/lib/types";

export const DEFAULT_SHOW: ShowConfig = {
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
// Mode detection
// ============================================================

export function isUsingBlob(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

// ============================================================
// Manifest I/O
// ============================================================

export async function readManifestFromStore(
  outputDir: string
): Promise<FeedManifest> {
  if (isUsingBlob()) {
    try {
      const { blobs } = await list({ prefix: "feed.json" });
      const feedBlob = blobs.find((b) => b.pathname === "feed.json");
      if (!feedBlob) {
        return { show: { ...DEFAULT_SHOW }, episodes: [] };
      }
      const res = await fetch(feedBlob.url);
      return (await res.json()) as FeedManifest;
    } catch {
      return { show: { ...DEFAULT_SHOW }, episodes: [] };
    }
  }

  // Local filesystem
  const feedPath = join(outputDir, "feed.json");
  try {
    const raw = await readFile(feedPath, "utf-8");
    return JSON.parse(raw) as FeedManifest;
  } catch {
    return { show: { ...DEFAULT_SHOW }, episodes: [] };
  }
}

export async function writeManifestToStore(
  outputDir: string,
  manifest: FeedManifest
): Promise<void> {
  if (isUsingBlob()) {
    await put("feed.json", JSON.stringify(manifest, null, 2), {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
    });
    return;
  }

  // Local filesystem
  const feedPath = join(outputDir, "feed.json");
  await writeFile(feedPath, JSON.stringify(manifest, null, 2));
}

// ============================================================
// Episode audio
// ============================================================

export async function uploadEpisodeAudio(
  slug: string,
  buffer: Buffer
): Promise<string> {
  const date = new Date().toISOString().slice(0, 10);
  const blob = await put(`episodes/${date}_${slug}.mp3`, buffer, {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "audio/mpeg",
  });
  return blob.url;
}

export async function deleteEpisodeAudio(blobUrl: string): Promise<void> {
  await del(blobUrl);
}
