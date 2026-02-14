import { existsSync, chmodSync } from "fs";
import { writeFile } from "fs/promises";
import { gunzipSync } from "zlib";

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
    const mod = await import("ffmpeg-static");
    cached = (mod.default as string) ?? "ffmpeg";
    return cached;
  }

  if (existsSync(FFMPEG_TMP)) {
    cached = FFMPEG_TMP;
    return cached;
  }

  console.log("[podify] Downloading ffmpeg binary...");
  const res = await fetch(FFMPEG_URL, { redirect: "follow" });
  if (!res.ok) throw new Error(`Failed to download ffmpeg: ${res.status}`);

  const compressed = Buffer.from(await res.arrayBuffer());
  const binary = gunzipSync(compressed);
  await writeFile(FFMPEG_TMP, binary, { mode: 0o755 });
  console.log(`[podify] ffmpeg ready (${(binary.length / 1e6).toFixed(0)} MB)`);

  cached = FFMPEG_TMP;
  return cached;
}
