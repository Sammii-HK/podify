import { describe, it, expect, vi, beforeEach } from "vitest";
import type { EpisodeMeta } from "@/lib/types";

vi.mock("@/lib/storage", () => ({
  readManifestFromStore: vi.fn().mockResolvedValue({
    show: {
      title: "Test Show",
      description: "A test podcast",
      link: "https://example.com",
      language: "en",
      author: "Test",
      email: "test@example.com",
      imageUrl: "",
      category: "Education",
      explicit: false,
    },
    episodes: [],
  }),
  writeManifestToStore: vi.fn().mockResolvedValue(undefined),
  isUsingBlob: vi.fn().mockReturnValue(false),
  uploadEpisodeAudio: vi.fn().mockResolvedValue("https://blob.test/ep.mp3"),
  deleteEpisodeAudio: vi.fn().mockResolvedValue(undefined),
}));

// Mock ffprobe-static
vi.mock("ffprobe-static", () => ({
  path: "/usr/bin/ffprobe",
}));

describe("feed manifest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("readManifest returns empty manifest when no data exists", async () => {
    const { readManifest } = await import("@/lib/feed");
    const manifest = await readManifest("/tmp/test");

    expect(manifest.episodes).toHaveLength(0);
    expect(manifest.show.title).toBe("Test Show");
  });

  it("addEpisodeToManifest prepends episode (newest first)", async () => {
    const { addEpisodeToManifest } = await import("@/lib/feed");
    const { writeManifestToStore } = await import("@/lib/storage");

    const episode: EpisodeMeta = {
      guid: "test-guid",
      slug: "test-episode",
      dirName: "2026-02-14_test-episode",
      title: "Test Episode",
      description: "A test",
      pubDate: new Date().toISOString(),
      durationSeconds: 120,
      fileSizeBytes: 1024,
      audioFileName: "test-episode.mp3",
      wordCount: 500,
      costUsd: 0.05,
    };

    await addEpisodeToManifest("/tmp/test", episode);

    expect(writeManifestToStore).toHaveBeenCalledOnce();
    const written = (writeManifestToStore as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(written.episodes[0].slug).toBe("test-episode");
  });

  it("addEpisodeToManifest handles slug collisions", async () => {
    const { readManifestFromStore, writeManifestToStore } = await import("@/lib/storage");

    // Pre-populate manifest with existing episode
    (readManifestFromStore as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      show: { title: "Test" },
      episodes: [{ slug: "test-episode", guid: "existing" }],
    });

    const { addEpisodeToManifest } = await import("@/lib/feed");

    const episode: EpisodeMeta = {
      guid: "new-guid",
      slug: "test-episode",
      dirName: "2026-02-14_test-episode",
      title: "Test Episode",
      description: "A duplicate slug",
      pubDate: new Date().toISOString(),
      durationSeconds: 120,
      fileSizeBytes: 1024,
      audioFileName: "test-episode.mp3",
      wordCount: 500,
      costUsd: 0.05,
    };

    await addEpisodeToManifest("/tmp/test", episode);

    const written = (writeManifestToStore as ReturnType<typeof vi.fn>).mock.calls[0][1];
    // Should append -2 to avoid collision
    expect(written.episodes[0].slug).toBe("test-episode-2");
  });
});
