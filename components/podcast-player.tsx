"use client";
import { useEffect, useRef, useState } from "react";
import { Download, Headphones, RotateCcw, ArrowUpRight } from "lucide-react";
import { formatDuration, safeAudioUrl } from "@/lib/client-workflow";
export default function PodcastPlayer({
  jobId,
  durationSeconds,
  wordCount,
  costUsd,
  audioUrl,
  audioEnabled = true,
}: {
  jobId: string;
  durationSeconds: number;
  wordCount: number;
  costUsd: number;
  audioUrl?: string;
  audioEnabled?: boolean;
}) {
  const source =
      safeAudioUrl(audioUrl) ||
      `/api/podcast/${encodeURIComponent(jobId)}/audio`,
    ref = useRef<HTMLAudioElement>(null),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
    const player = ref.current;
    const external = source.startsWith("http");
    return () => {
      if (player) {
        player.pause();
        player.removeAttribute("src");
        player.load();
      }
    };
  }, [source, audioEnabled]);
  return (
    <section className="player-panel" aria-label="Episode player">
      <div className="panel-top">
        <span className="section-label">Your listen</span>
        <Headphones aria-hidden size={21} />
      </div>
      <h2>Listen, then take it with you.</h2>
      <div className="episode-facts">
        <span>
          <strong>{formatDuration(durationSeconds)}</strong>length
        </span>
        <span>
          <strong>
            {Number.isFinite(wordCount)
              ? wordCount.toLocaleString("en-GB")
              : "Unavailable"}
          </strong>
          words
        </span>
        <span>
          <strong>
            {Number.isFinite(costUsd)
              ? `$${costUsd.toFixed(4)}`
              : "Unavailable"}
          </strong>
          estimated generation cost
        </span>
      </div>
      {audioEnabled ? (
        <audio
          ref={ref}
          key={source}
          controls
          preload="none"
          src={source}
          aria-label="Episode audio"
          onError={() => setFailed(true)}
        >
          Your browser does not support audio playback.
        </audio>
      ) : (
        <div className="audio-disconnected">
          <Headphones aria-hidden size={25} />
          <span>Audio is disconnected in this review.</span>
        </div>
      )}
      {failed && (
        <div className="notice error" role="alert">
          <strong>Audio could not be loaded.</strong>
          <span>The transcript and episode details remain available.</span>
          <button
            className="text-button"
            onClick={() => {
              setFailed(false);
              ref.current?.load();
            }}
            type="button"
          >
            <RotateCcw aria-hidden size={15} />
            Retry audio
          </button>
        </div>
      )}
      {audioEnabled && (
        <a
          href={source}
          download={external ? undefined : "podcast.mp3"}
          target={external ? "_blank" : undefined}
          rel={external ? "noreferrer" : undefined}
          className="secondary-button"
        >
          {external ? (
            <ArrowUpRight aria-hidden size={16} />
          ) : (
            <Download aria-hidden size={16} />
          )}
          {external ? "Open MP3 file" : "Download MP3"}
        </a>
      )}
    </section>
  );
}
