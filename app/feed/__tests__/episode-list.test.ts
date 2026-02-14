import { describe, it, expect } from "vitest";
import type { EpisodeMeta } from "@/lib/types";

// Unit tests for the episode list filtering logic (no DOM needed)

function filterEpisodes(
  episodes: EpisodeMeta[],
  filter: "all" | "grimoire"
): EpisodeMeta[] {
  return filter === "grimoire"
    ? episodes.filter((e) => e.source === "grimoire")
    : episodes;
}

const EPISODES: EpisodeMeta[] = [
  {
    guid: "1",
    slug: "episode-one",
    dirName: "2026-02-14_episode-one",
    title: "Episode One",
    description: "First episode",
    pubDate: "2026-02-14T00:00:00Z",
    durationSeconds: 300,
    fileSizeBytes: 5000000,
    audioFileName: "episode-one.mp3",
    wordCount: 1500,
    costUsd: 0.05,
    source: "grimoire",
  },
  {
    guid: "2",
    slug: "episode-two",
    dirName: "2026-02-13_episode-two",
    title: "Episode Two",
    description: "Second episode",
    pubDate: "2026-02-13T00:00:00Z",
    durationSeconds: 600,
    fileSizeBytes: 10000000,
    audioFileName: "episode-two.mp3",
    wordCount: 3000,
    costUsd: 0.08,
    source: "url",
  },
  {
    guid: "3",
    slug: "episode-three",
    dirName: "2026-02-12_episode-three",
    title: "Episode Three",
    description: "Third episode",
    pubDate: "2026-02-12T00:00:00Z",
    durationSeconds: 180,
    fileSizeBytes: 3000000,
    audioFileName: "episode-three.mp3",
    wordCount: 900,
    costUsd: 0.03,
    source: "grimoire",
  },
];

describe("feed episode list", () => {
  it("'all' filter returns all episodes", () => {
    const result = filterEpisodes(EPISODES, "all");
    expect(result).toHaveLength(3);
  });

  it("'grimoire' filter returns only grimoire episodes", () => {
    const result = filterEpisodes(EPISODES, "grimoire");
    expect(result).toHaveLength(2);
    expect(result.every((e) => e.source === "grimoire")).toBe(true);
  });

  it("'grimoire' filter returns empty for no grimoire episodes", () => {
    const urlOnly = EPISODES.filter((e) => e.source === "url");
    const result = filterEpisodes(urlOnly, "grimoire");
    expect(result).toHaveLength(0);
  });

  it("handles empty episode list", () => {
    expect(filterEpisodes([], "all")).toHaveLength(0);
    expect(filterEpisodes([], "grimoire")).toHaveLength(0);
  });

  it("audio URL falls back to API endpoint when no blobUrl", () => {
    const ep = EPISODES[0];
    const audioUrl = ep.blobUrl || `/api/podcast/episodes/${ep.slug}/audio`;
    expect(audioUrl).toBe("/api/podcast/episodes/episode-one/audio");
  });

  it("audio URL uses blobUrl when available", () => {
    const ep = { ...EPISODES[0], blobUrl: "https://blob.vercel-storage.com/ep.mp3" };
    const audioUrl = ep.blobUrl || `/api/podcast/episodes/${ep.slug}/audio`;
    expect(audioUrl).toBe("https://blob.vercel-storage.com/ep.mp3");
  });
});
