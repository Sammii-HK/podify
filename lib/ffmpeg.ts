import { existsSync, chmodSync } from "fs";
import { writeFile } from "fs/promises";

const FFMPEG_TMP = "/tmp/ffmpeg";
const FFMPEG_URL =
  "https://github.com/eugeneware/ffmpeg-static/releases/download/b5.3.0/linux-x64";

let cached: string | undefined;

/**
 * Returns the path to the ffmpeg binary.
 * - Local dev: uses ffmpeg-static from node_modules
 * - Vercel: downloads the static binary to /tmp on first call, then caches
 */
export async function getFFmpegPath(): Promise<string> {
  if (cached) return cached;

  if (!process.env.VERCEL) {
    // Local: use ffmpeg-static package
    const mod = await import("ffmpeg-static");
    cached = (mod.default as string) ?? "ffmpeg";
    return cached;
  }

  // Vercel: check /tmp cache first
  if (existsSync(FFMPEG_TMP)) {
    cached = FFMPEG_TMP;
    return cached;
  }

  // Download static binary
  console.log("[podify] Downloading ffmpeg binary...");
  const res = await fetch(FFMPEG_URL, { redirect: "follow" });
  if (!res.ok) throw new Error(`Failed to download ffmpeg: ${res.status}`);

  const buffer = Buffer.from(await res.arrayBuffer());
  await writeFile(FFMPEG_TMP, buffer);
  chmodSync(FFMPEG_TMP, 0o755);
  console.log(`[podify] ffmpeg downloaded (${(buffer.length / 1e6).toFixed(1)} MB)`);

  cached = FFMPEG_TMP;
  return cached;
}
