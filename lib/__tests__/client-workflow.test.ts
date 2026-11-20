import { describe, it, expect, vi } from "vitest";
import {
  defaultBrief,
  briefProblem,
  generationBody,
  parseJobSnapshot,
  requestJob,
  requestProcessing,
  monitorJob,
  formatDuration,
  safeAudioUrl,
  delay,
} from "../client-workflow";
const form = () => ({
  ...defaultBrief(),
  content:
    "A hand-written fixture passage, long enough to be accepted as source material for a unit test.",
});
const pending = {
  id: "job-1",
  status: "processing",
  progress: 40,
  stage: "audio",
  message: "Fixture",
};
const complete = {
  ...pending,
  status: "complete",
  progress: 100,
  result: {
    transcript: [
      { speaker: "HOST_A", text: "Fixture text, not generated output." },
    ],
    durationSeconds: 59.6,
    wordCount: 6,
    costUsd: 0,
  },
};
describe("client handoff boundaries", () => {
  it("validates the selected source and sends only that source without losing pipeline choices", () => {
    const f = form();
    expect(briefProblem({ ...f, content: " ".repeat(80) })).toBeTruthy();
    expect(
      briefProblem({ ...f, contentSource: "url", url: "javascript:alert(1)" }),
    ).toBeTruthy();
    expect(
      generationBody({
        ...f,
        contentSource: "url",
        url: "https://example.test/passage",
        instructions: "  Read slowly  ",
      }),
    ).toEqual(
      expect.objectContaining({
        url: "https://example.test/passage",
        async: true,
        tts: "voicebox",
        llm: "ollama",
        instructions: "Read slowly",
      }),
    );
    expect(
      generationBody({
        ...f,
        contentSource: "url",
        url: "https://example.test/passage",
      }),
    ).not.toHaveProperty("content");
  });
  it("handles non-JSON errors and an invalid acknowledgement without manufacturing a job", async () => {
    await expect(
      requestJob(
        form(),
        async () => new Response("<html>Gateway</html>", { status: 502 }),
        new AbortController().signal,
      ),
    ).rejects.toThrow("HTTP 502");
    await expect(
      requestJob(
        form(),
        async () => Response.json({ jobId: "../../secret" }),
        new AbortController().signal,
      ),
    ).rejects.toThrow("No valid job reference");
  });
  it("preserves ambiguity after network failure and does not automatically retry generation", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("disconnected"));
    await expect(
      requestJob(form(), fetcher, new AbortController().signal),
    ).rejects.toThrow("may have been created");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("exposes process-start failure and treats an existing job as observation rather than duplicate start", async () => {
    await expect(
      requestProcessing(
        "job-1",
        async () => new Response("Unavailable", { status: 503 }),
        new AbortController().signal,
      ),
    ).rejects.toThrow("HTTP 503");
    await expect(
      requestProcessing(
        "job-1",
        async () =>
          Response.json({ error: "already started" }, { status: 409 }),
        new AbortController().signal,
      ),
    ).resolves.toBeUndefined();
  });
  it("accepts only a complete result for the requested job and clamps a reported overshoot", () => {
    expect(
      parseJobSnapshot({ ...pending, progress: 120 }, "job-1").progress,
    ).toBe(100);
    expect(() =>
      parseJobSnapshot({ ...complete, id: "other" }, "job-1"),
    ).toThrow();
    expect(() =>
      parseJobSnapshot(
        { ...complete, result: { ...complete.result, costUsd: NaN } },
        "job-1",
      ),
    ).toThrow();
    expect(() =>
      parseJobSnapshot(
        {
          ...complete,
          result: {
            ...complete.result,
            transcript: [{ speaker: "HOST_A", text: 42 }],
          },
        },
        "job-1",
      ),
    ).toThrow();
  });
  it("polls serially with no-store and returns the validated result", async () => {
    const fetcher = vi
        .fn()
        .mockResolvedValueOnce(Response.json(pending))
        .mockResolvedValueOnce(Response.json(complete)),
      onSnapshot = vi.fn();
    const result = await monitorJob("job-1", {
      fetcher,
      signal: new AbortController().signal,
      onSnapshot,
      wait: async () => {},
    });
    expect(result.status).toBe("complete");
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0][1]).toEqual(
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(onSnapshot).toHaveBeenCalledTimes(2);
  });
  it("ignores a late response after observation is aborted", async () => {
    let finish!: (value: Response) => void;
    const response = new Promise<Response>((resolve) => (finish = resolve)),
      controller = new AbortController(),
      onSnapshot = vi.fn();
    const result = monitorJob("job-1", {
      fetcher: async () => response,
      signal: controller.signal,
      onSnapshot,
    }).catch((error) => error);
    controller.abort();
    finish(Response.json(complete));
    await result;
    expect(onSnapshot).not.toHaveBeenCalled();
  });
  it("bounds observation time without asserting that the server job was cancelled", async () => {
    let now = 0;
    const fetcher = vi.fn(async () => Response.json(pending));
    await expect(
      monitorJob("job-1", {
        fetcher,
        signal: new AbortController().signal,
        onSnapshot: () => {},
        now: () => now,
        maxMs: 1000,
        wait: async () => {
          now += 1000;
        },
      }),
    ).rejects.toThrow("may still be running");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("cancels the wait promptly when its observer leaves", async () => {
    vi.useFakeTimers();
    try {
      const controller = new AbortController();
      const wait = delay(1000, controller.signal).catch(() => {});
      expect(vi.getTimerCount()).toBe(1);
      controller.abort();
      await wait;
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
  it("releases the per-request timeout after a completed snapshot", async () => {
    vi.useFakeTimers();
    try {
      const result = await monitorJob("job-1", {
        fetcher: async () => Response.json(complete),
        signal: new AbortController().signal,
        onSnapshot: () => {},
      });
      expect(result.status).toBe("complete");
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
  it("rounds once before splitting minutes and rejects unsafe audio destinations", () => {
    expect(formatDuration(59.6)).toBe("1m 0s");
    expect(formatDuration(NaN)).toBe("Duration unavailable");
    expect(formatDuration(-1)).toBe("Duration unavailable");
    for (const value of [
      "javascript:alert(1)",
      "//other.test/a",
      "/\\other.test/a",
      "/\n/other.test/a",
      "https://user:pass@other.test/a",
    ])
      expect(safeAudioUrl(value)).toBeUndefined();
    expect(safeAudioUrl("/api/podcast/job-1/audio")).toBe(
      "/api/podcast/job-1/audio",
    );
  });
});
