import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { getJob } from "@/lib/jobs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const job = await getJob(jobId);

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  if (job.status !== "complete" || !job.result?.audioPath) {
    return NextResponse.json(
      { error: "Audio not ready" },
      { status: 404 }
    );
  }

  try {
    const audioBuffer = await readFile(job.result.audioPath);
    return new NextResponse(audioBuffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": audioBuffer.length.toString(),
        "Content-Disposition": `inline; filename="podcast.mp3"`,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Audio file not found on disk" },
      { status: 404 }
    );
  }
}
