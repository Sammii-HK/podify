"use client";

import { useState } from "react";
import type { EpisodeMeta } from "@/lib/types";

function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}m ${s}s`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

const SOURCE_LABELS: Record<string, string> = {
  grimoire: "Grimoire",
  url: "URL",
  text: "Text",
};

function EpisodeCard({ episode }: { episode: EpisodeMeta }) {
  const audioUrl = episode.blobUrl || `/api/podcast/episodes/${episode.slug}/audio`;

  return (
    <div className="rounded-xl border border-card-border bg-card p-5">
      <div className="mb-2 flex items-start justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">{episode.title}</h2>
        {episode.source && (
          <span className="shrink-0 rounded-md bg-accent/15 px-2 py-0.5 text-xs text-accent">
            {SOURCE_LABELS[episode.source] || episode.source}
          </span>
        )}
      </div>

      {episode.description && (
        <p className="mb-3 text-sm leading-relaxed text-muted">{episode.description}</p>
      )}

      <div className="flex items-center justify-between">
        <div className="flex gap-3 text-xs text-muted">
          <span>{formatDate(episode.pubDate)}</span>
          <span>{formatDuration(episode.durationSeconds)}</span>
          {episode.wordCount > 0 && <span>{episode.wordCount.toLocaleString()} words</span>}
        </div>
        <a
          href={audioUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-accent hover:underline"
        >
          Play audio
        </a>
      </div>
    </div>
  );
}

export function FeedEpisodeList({ episodes }: { episodes: EpisodeMeta[] }) {
  const [filter, setFilter] = useState<"all" | "grimoire">("all");

  const filtered =
    filter === "grimoire"
      ? episodes.filter((e) => e.source === "grimoire")
      : episodes;

  const grimoireCount = episodes.filter((e) => e.source === "grimoire").length;

  return (
    <div>
      <div className="mb-6 flex gap-1 rounded-lg bg-card p-1">
        <button
          onClick={() => setFilter("all")}
          className={`flex-1 rounded-md px-3 py-1.5 text-sm transition-colors ${
            filter === "all"
              ? "bg-accent/20 text-accent"
              : "text-muted hover:text-foreground"
          }`}
        >
          All Episodes ({episodes.length})
        </button>
        <button
          onClick={() => setFilter("grimoire")}
          className={`flex-1 rounded-md px-3 py-1.5 text-sm transition-colors ${
            filter === "grimoire"
              ? "bg-accent/20 text-accent"
              : "text-muted hover:text-foreground"
          }`}
        >
          Grimoire ({grimoireCount})
        </button>
      </div>

      {filtered.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted">
          {filter === "grimoire"
            ? "No grimoire episodes yet."
            : "No episodes yet. Generate one to get started."}
        </p>
      ) : (
        <div className="space-y-4">
          {filtered.map((ep) => (
            <EpisodeCard key={ep.guid} episode={ep} />
          ))}
        </div>
      )}
    </div>
  );
}
