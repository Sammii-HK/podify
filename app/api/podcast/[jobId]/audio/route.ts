import { requireJob, privateJson } from "@/lib/job-access";
import { NextResponse } from "next/server";
import { readFile } from "fs/promises";


export async function GET(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const access = await requireJob(request, jobId);
  if (access.response) return access.response;
  const job = access.job;

  if (job.status !== "complete" || !job.result?.audioPath) {
    return privateJson(
      { error: "Audio not ready" },
      { status: 404 }
    );
  }

  try {
    const audioBuffer = await readFile(job.result.audioPath);
    return new NextResponse(audioBuffer, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": "audio/mpeg",
        "Content-Length": audioBuffer.length.toString(),
        "Content-Disposition": `inline; filename="podcast.mp3"`,
      },
    });
  } catch {
    return privateJson(
      { error: "Audio file not found on disk" },
      { status: 404 }
    );
  }
}
