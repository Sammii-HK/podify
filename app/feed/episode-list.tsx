"use client";
import { useId, useMemo, useState } from "react";
import { ArrowUpRight, AudioLines, Search } from "lucide-react";
import type { EpisodeMeta } from "@/lib/types";
import {
  formatDuration,
  formatEpisodeDate,
  safeAudioUrl,
} from "@/lib/client-workflow";
export function filterEpisodes(
  episodes: EpisodeMeta[],
  filter: "all" | "grimoire",
  query = "",
) {
  const term = query.trim().toLocaleLowerCase("en-GB");
  return episodes.filter(
    (episode) =>
      (filter === "all" || episode.source === "grimoire") &&
      (!term ||
        `${episode.title} ${episode.description}`
          .toLocaleLowerCase("en-GB")
          .includes(term)),
  );
}
export function FeedEpisodeList({
  episodes,
  audioEnabled = true,
}: {
  episodes: EpisodeMeta[];
  audioEnabled?: boolean;
}) {
  const [filter, setFilter] = useState<"all" | "grimoire">("all"),
    [query, setQuery] = useState(""),
    id = useId();
  const filtered = useMemo(
    () => filterEpisodes(episodes, filter, query),
    [episodes, filter, query],
  );
  return (
    <>
      <div className="feed-tools">
        <label className="feed-search" htmlFor={id}>
          <Search aria-hidden size={17} />
          <span className="visually-hidden">
            Search episode titles and descriptions
          </span>
          <input
            id={id}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a listen"
          />
        </label>
        <div className="feed-filters" role="group" aria-label="Episode source">
          <button
            type="button"
            aria-pressed={filter === "all"}
            onClick={() => setFilter("all")}
          >
            All episodes <span>{episodes.length}</span>
          </button>
          <button
            type="button"
            aria-pressed={filter === "grimoire"}
            onClick={() => setFilter("grimoire")}
          >
            Grimoire{" "}
            <span>
              {
                episodes.filter((episode) => episode.source === "grimoire")
                  .length
              }
            </span>
          </button>
        </div>
      </div>
      <p className="feed-count" role="status">
        {filtered.length} {filtered.length === 1 ? "episode" : "episodes"} shown
      </p>
      {!filtered.length ? (
        <section className="feed-empty">
          <AudioLines aria-hidden size={35} />
          <h2>
            {episodes.length
              ? "A little quiet here."
              : "The first listen starts here."}
          </h2>
          <p>
            {episodes.length
              ? "No episodes match these choices."
              : "There are no episodes in this feed yet."}
          </p>
          {episodes.length ? (
            <button
              className="text-button"
              type="button"
              onClick={() => {
                setQuery("");
                setFilter("all");
              }}
            >
              Clear the filters
            </button>
          ) : (
            <a href="/" className="text-button">
              Back to the studio
              <ArrowUpRight aria-hidden size={16} />
            </a>
          )}
        </section>
      ) : (
        <ol className="episode-list">
          {filtered.map((episode, index) => {
            const audioUrl =
              safeAudioUrl(episode.blobUrl) ||
              `/api/podcast/episodes/${encodeURIComponent(episode.slug)}/audio`;
            return (
              <li key={episode.guid}>
                <article className="episode-card">
                  <span className="episode-number">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div className="episode-detail">
                    <div className="episode-source">
                      {episode.source === "grimoire"
                        ? "Grimoire"
                        : episode.source === "url"
                          ? "Article"
                          : episode.source === "text"
                            ? "Text"
                            : "Episode"}
                    </div>
                    <h2>{episode.title}</h2>
                    <p>{episode.description}</p>
                    <div className="episode-metadata">
                      <time dateTime={episode.pubDate}>
                        {formatEpisodeDate(episode.pubDate)}
                      </time>
                      <span>{formatDuration(episode.durationSeconds)}</span>
                      {episode.wordCount > 0 && (
                        <span>
                          {episode.wordCount.toLocaleString("en-GB")} words
                        </span>
                      )}
                    </div>
                  </div>
                  {audioEnabled ? (
                    <a
                      className="episode-open"
                      href={audioUrl}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Open audio for ${episode.title} in a new tab`}
                    >
                      Listen
                      <ArrowUpRight aria-hidden size={17} />
                    </a>
                  ) : (
                    <span className="episode-offline">Audio disconnected</span>
                  )}
                </article>
              </li>
            );
          })}
        </ol>
      )}
    </>
  );
}
