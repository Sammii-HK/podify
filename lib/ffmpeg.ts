import { existsSync, chmodSync, createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import { createGunzip } from "zlib";

const FFMPEG_TMP = "/tmp/ffmpeg";
const FFMPEG_URL =
  "https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffmpeg-linux-x64.gz";

let cached: string | undefined;

/**
 * Returns the path to the ffmpeg binary.
 * - Local dev: uses ffmpeg-static from node_modules
 * - Vercel: downloads the gzipped static binary to /tmp on first call, then caches
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

  // Download and decompress gzipped binary
  console.log("[podify] Downloading ffmpeg binary...");
  const res = await fetch(FFMPEG_URL, { redirect: "follow" });
  if (!res.ok) throw new Error(`Failed to download ffmpeg: ${res.status}`);
  if (!res.body) throw new Error("Empty response body downloading ffmpeg");

  const gunzip = createGunzip();
  const out = createWriteStream(FFMPEG_TMP);

  // Stream: fetch response -> gunzip -> file
  const { Readable } = await import("stream");
  const readable = Readable.fromWeb(res.body as import("stream/web").ReadableStream);
  await pipeline(readable, gunzip, out);

  chmodSync(FFMPEG_TMP, 0o755);
  console.log("[podify] ffmpeg ready");

  cached = FFMPEG_TMP;
  return cached;
}
