// @vitest-environment jsdom
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PodifyWorkspace from "@/components/podify-workspace";
import PodcastPlayer from "@/components/podcast-player";
import TranscriptView from "@/components/transcript-view";
import { VOICE_PRESETS } from "../types";
let root: Root, host: HTMLDivElement;
(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});
async function tick() {
  for (let i = 0; i < 12; i++) await Promise.resolve();
}
async function input(selector: string, value: string) {
  const el = host.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    selector,
  )!;
  const prototype =
    el.tagName === "TEXTAREA"
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const source =
  "This review text was written only for a local unit test. It does not contain a real article or a generated result.";
async function submit() {
  await act(async () => {
    host
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await tick();
  });
}
describe("actual client components", () => {
  it("keeps the complete brief and explains a non-JSON request failure", async () => {
    const fetcher = vi.fn(async () => new Response("Gateway", { status: 502 }));
    await act(async () => root.render(h(PodifyWorkspace, { fetcher })));
    await input("textarea", source);
    await input('input[id$="-title"]', "A kept title");
    await submit();
    expect(host.querySelector("textarea")!.value).toBe(source);
    expect(
      host.querySelector<HTMLInputElement>('input[id$="-title"]')!.value,
    ).toBe("A kept title");
    expect(host.querySelector("[role=alert]")!.textContent).toContain(
      "HTTP 502",
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("locks a pending submission synchronously before React paints the disabled button", async () => {
    let finish!: (r: Response) => void;
    const fetcher = vi.fn(
      () => new Promise<Response>((resolve) => (finish = resolve)),
    );
    await act(async () => root.render(h(PodifyWorkspace, { fetcher })));
    await input("textarea", source);
    await act(async () => {
      const form = host.querySelector("form")!;
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish(new Response("No", { status: 503 }));
      await tick();
    });
  });
  it("shows failed processing acknowledgement, retains its job and aborts observation when stopped", async () => {
    let statusSignal: AbortSignal | undefined;
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/generate"))
        return Response.json({ jobId: "fixture-job" });
      if (url.includes("/process/")) throw new Error("offline");
      statusSignal = init?.signal as AbortSignal;
      return new Promise<Response>((_resolve, reject) => {
        statusSignal!.addEventListener(
          "abort",
          () => reject(statusSignal!.reason),
          { once: true },
        );
      });
    });
    await act(async () => root.render(h(PodifyWorkspace, { fetcher })));
    await input("textarea", source);
    await submit();
    expect(host.textContent).toContain("Processing could not be confirmed");
    const stop = [...host.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Stop checking"),
    )!;
    await act(async () => {
      stop.click();
      await tick();
    });
    expect(statusSignal!.aborted).toBe(true);
    expect(host.textContent).toContain("fixture-job");
    expect(host.textContent).toContain("does not request another generation");
    expect(
      fetcher.mock.calls.filter(([url]) => url.endsWith("/generate")),
    ).toHaveLength(1);
  });
  it("renders only a validated completion and keeps audio loading deliberate", async () => {
    const fetcher = vi.fn(async (url: string) =>
      url.endsWith("/generate")
        ? Response.json({ jobId: "fixture-job" })
        : url.includes("/process/")
          ? Response.json({ status: "complete" })
          : Response.json({
              id: "fixture-job",
              status: "complete",
              stage: "complete",
              progress: 100,
              message: "Fixture result",
              result: {
                transcript: [
                  { speaker: "HOST_A", text: "Hand-written test line." },
                ],
                durationSeconds: 59.6,
                wordCount: 4,
                costUsd: 0,
              },
            }),
    );
    await act(async () => root.render(h(PodifyWorkspace, { fetcher })));
    await input("textarea", source);
    await submit();
    expect(host.textContent).toContain("Episode ready");
    expect(host.textContent).toContain("1m 0s");
    expect(host.querySelector("audio")!.getAttribute("preload")).toBe("none");
    expect(document.activeElement?.textContent).toBe("Your episode");
  });
  it("names a remote audio link as opening a file rather than guaranteeing a browser download", async () => {
    await act(async () =>
      root.render(
        h(PodcastPlayer, {
          jobId: "fixture",
          durationSeconds: 60,
          wordCount: 4,
          costUsd: 0,
          audioUrl: "https://example.test/review.mp3",
        }),
      ),
    );
    const link = host.querySelector<HTMLAnchorElement>("a")!;
    expect(link.textContent).toContain("Open MP3 file");
    expect(link.hasAttribute("download")).toBe(false);
    expect(link.target).toBe("_blank");
  });
  it("keeps source voice labels aligned with the preset names", async () => {
    await act(async () => root.render(h(PodifyWorkspace)));
    const first = host.querySelector(".voice-card")!;
    expect(first.textContent).toContain(VOICE_PRESETS.luna_and_sol.host_a.name);
    expect(first.textContent).toContain(VOICE_PRESETS.luna_and_sol.host_b.name);
    expect(first.querySelector("input")!.type).toBe("radio");
  });
  it("keeps transcript roles literal and exposes an expanded-state relationship", async () => {
    const transcript = Array.from({ length: 10 }, (_, i) => ({
      speaker: i ? "HOST_A" : "NARRATOR",
      text: `Review line ${i}`,
    }));
    await act(async () => root.render(h(TranscriptView, { transcript })));
    expect(host.textContent).toContain("NARRATOR");
    expect(host.querySelectorAll("li")).toHaveLength(8);
    const button = host.querySelector("button")!;
    await act(async () => button.click());
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(
      document
        .getElementById(button.getAttribute("aria-controls")!)!
        .querySelectorAll("li"),
    ).toHaveLength(10);
  });
  it("provides audio failure recovery and releases media on unmount", async () => {
    await act(async () =>
      root.render(
        h(PodcastPlayer, {
          jobId: "fixture",
          durationSeconds: 59.6,
          wordCount: 4,
          costUsd: 0,
        }),
      ),
    );
    const audio = host.querySelector("audio")!;
    await act(async () => audio.dispatchEvent(new Event("error")));
    expect(host.querySelector("[role=alert]")!.textContent).toContain(
      "Audio could not be loaded",
    );
    await act(async () => host.querySelector("button")!.click());
    expect(HTMLMediaElement.prototype.load).toHaveBeenCalledTimes(1);
    await act(async () => root.render(h("div")));
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalledTimes(1);
    expect(audio.hasAttribute("src")).toBe(false);
  });
});
