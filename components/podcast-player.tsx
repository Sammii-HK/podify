"use client";

export default function PodcastPlayer({
  jobId,
  durationSeconds,
  wordCount,
  costUsd,
}: {
  jobId: string;
  durationSeconds: number;
  wordCount: number;
  costUsd: number;
}) {
  const audioUrl = `/api/podcast/${jobId}/audio`;
  const minutes = Math.floor(durationSeconds / 60);
  const seconds = Math.round(durationSeconds % 60);

  return (
    <div className="space-y-4">
      {/* Audio player */}
      <audio controls className="w-full" src={audioUrl}>
        Your browser does not support audio playback.
      </audio>

      {/* Metadata */}
      <div className="flex flex-wrap gap-4 text-xs text-muted">
        <span>
          {minutes}m {seconds}s
        </span>
        <span>{wordCount.toLocaleString()} words</span>
        <span>${costUsd.toFixed(4)} cost</span>
      </div>

      {/* Download */}
      <a
        href={audioUrl}
        download="podcast.mp3"
        className="inline-block rounded-lg border border-card-border px-4 py-2 text-sm text-foreground transition-colors hover:border-accent hover:text-accent"
      >
        Download MP3
      </a>
    </div>
  );
}
