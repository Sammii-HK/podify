import { describe, it, expect, vi, beforeEach } from "vitest";
import type { OnProgress, ProgressEvent } from "@/lib/pipeline";

// Mock all heavy dependencies so we test pipeline logic, not external services
vi.mock("fs/promises", () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockResolvedValue(Buffer.from("fake")),
  stat: vi.fn().mockResolvedValue({ size: 1024 }),
  rm: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/generate-script", () => ({
  generateScript: vi.fn().mockResolvedValue([
    { speaker: "HOST_A", text: "Hello and welcome to the show." },
    { speaker: "HOST_B", text: "Thanks for having me." },
  ]),
  generateEpisodeDescription: vi.fn().mockResolvedValue("A test episode."),
}));

vi.mock("@/lib/generate-audio", () => ({
  generateAudio: vi.fn().mockResolvedValue([
    { path: "/tmp/clip1.wav", speaker: "HOST_A", durationMs: 2000 },
    { path: "/tmp/clip2.wav", speaker: "HOST_B", durationMs: 1500 },
  ]),
}));

vi.mock("@/lib/assemble-podcast", () => ({
  assemblePodcast: vi.fn().mockResolvedValue({ durationSeconds: 120 }),
}));

vi.mock("@/lib/feed", () => ({
  addEpisodeToManifest: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/storage", () => ({
  isUsingBlob: vi.fn().mockReturnValue(false),
  uploadEpisodeAudio: vi.fn().mockResolvedValue("https://blob.test/ep.mp3"),
}));

const TEST_CONFIG = {
  content: "Test content for podcast generation that is long enough",
  title: "Test Episode",
  format: "conversation" as const,
  duration: "5min" as const,
  tone: "educational" as const,
  voices: {
    host_a: { id: "af_luna", name: "Luna" },
    host_b: { id: "am_adam", name: "Sol" },
  },
  ttsProvider: "deepinfra" as const,
  llmProvider: "openrouter" as const,
  includeMusic: false,
  source: "text",
};

describe("pipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("OnProgress type accepts sync callbacks", async () => {
    const { generateEpisode } = await import("@/lib/pipeline");
    const events: ProgressEvent[] = [];

    const syncCallback: OnProgress = (event) => {
      events.push(event);
    };

    await generateEpisode(TEST_CONFIG, "/tmp/test-output", syncCallback);

    expect(events.length).toBeGreaterThanOrEqual(4);
    expect(events[0].stage).toBe("scripting");
    expect(events[events.length - 1].stage).toBe("complete");
    expect(events[events.length - 1].percent).toBe(100);
  });

  it("OnProgress type accepts async callbacks", async () => {
    const { generateEpisode } = await import("@/lib/pipeline");
    const events: ProgressEvent[] = [];

    const asyncCallback: OnProgress = async (event) => {
      await new Promise((r) => setTimeout(r, 1));
      events.push(event);
    };

    await generateEpisode(TEST_CONFIG, "/tmp/test-output", asyncCallback);

    expect(events.length).toBeGreaterThanOrEqual(4);
    expect(events[0].stage).toBe("scripting");
    expect(events[events.length - 1].stage).toBe("complete");
  });

  it("awaits async onProgress before continuing", async () => {
    const { generateEpisode } = await import("@/lib/pipeline");
    const order: string[] = [];

    const asyncCallback: OnProgress = async (event) => {
      await new Promise((r) => setTimeout(r, 10));
      order.push(`progress:${event.stage}`);
    };

    // Patch generateScript to track ordering
    const { generateScript } = await import("@/lib/generate-script");
    (generateScript as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      order.push("generateScript:start");
      return [
        { speaker: "HOST_A", text: "Hello." },
        { speaker: "HOST_B", text: "Hi." },
      ];
    });

    await generateEpisode(TEST_CONFIG, "/tmp/test-output", asyncCallback);

    // The first progress event should resolve BEFORE generateScript starts
    const progressIdx = order.indexOf("progress:scripting");
    const scriptIdx = order.indexOf("generateScript:start");
    expect(progressIdx).toBeLessThan(scriptIdx);
  });

  it("works without onProgress callback", async () => {
    const { generateEpisode } = await import("@/lib/pipeline");

    const result = await generateEpisode(TEST_CONFIG, "/tmp/test-output");

    expect(result.durationSeconds).toBe(120);
    expect(result.transcript).toHaveLength(2);
  });

  it("reports all four stages via onProgress", async () => {
    const { generateEpisode } = await import("@/lib/pipeline");
    const stages = new Set<string>();

    await generateEpisode(TEST_CONFIG, "/tmp/test-output", (event) => {
      stages.add(event.stage);
    });

    expect(stages).toContain("scripting");
    expect(stages).toContain("audio");
    expect(stages).toContain("assembly");
    expect(stages).toContain("complete");
  });

  it("generation survives when onProgress throws on inner callbacks", async () => {
    const { generateEpisode } = await import("@/lib/pipeline");
    const { generateAudio } = await import("@/lib/generate-audio");

    // Make generateAudio call its progress callback (simulating inner callback)
    (generateAudio as ReturnType<typeof vi.fn>).mockImplementation(
      async (_script: unknown, _config: unknown, _workDir: unknown, onProgress?: (msg: string, pct: number) => void) => {
        // This inner callback is wrapped in Promise.resolve().catch() by pipeline
        onProgress?.("clip 1/2", 40);
        onProgress?.("clip 2/2", 60);
        return [
          { path: "/tmp/clip1.wav", speaker: "HOST_A", durationMs: 2000 },
          { path: "/tmp/clip2.wav", speaker: "HOST_B", durationMs: 1500 },
        ];
      }
    );

    let innerCallCount = 0;
    const failingCallback: OnProgress = async (event) => {
      // Throw only on inner callbacks (not the direct stage-boundary calls)
      // Direct calls: percent 0 (scripting), 30 (audio), 80 (assembly), 100 (complete)
      if (![0, 30, 80, 100].includes(event.percent)) {
        innerCallCount++;
        throw new Error("Simulated blob write failure");
      }
    };

    // Should not throw — inner callback errors are caught via Promise.resolve().catch()
    const result = await generateEpisode(TEST_CONFIG, "/tmp/test-output", failingCallback);
    expect(result.durationSeconds).toBe(120);
    expect(innerCallCount).toBeGreaterThan(0);
  });
});
