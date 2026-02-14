import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";
import { readManifest } from "@/lib/feed";

const OUTPUT_DIR = ".podify-output";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const manifest = await readManifest(OUTPUT_DIR);

  const episode = manifest.episodes.find((e) => e.slug === slug);
  if (!episode) {
    return NextResponse.json({ error: "Episode not found" }, { status: 404 });
  }

  const audioPath = join(OUTPUT_DIR, episode.dirName, episode.audioFileName);

  try {
    const audioBuffer = await readFile(audioPath);
    return new NextResponse(audioBuffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": audioBuffer.length.toString(),
        "Content-Disposition": `inline; filename="${episode.audioFileName}"`,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Audio file not found on disk" },
      { status: 404 }
    );
  }
}
