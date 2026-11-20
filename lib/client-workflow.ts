import type { PodcastConfig, ScriptLine } from "./types";
export interface PodcastFormValues {
  contentSource: "text" | "url" | "grimoire";
  content: string;
  url: string;
  grimoirePath: string;
  title: string;
  format: PodcastConfig["format"];
  duration: PodcastConfig["duration"];
  tone: PodcastConfig["tone"];
  voices: string;
  tts: PodcastConfig["ttsProvider"];
  llm: PodcastConfig["llmProvider"];
  includeMusic: boolean;
  instructions: string;
}
export const defaultBrief = (): PodcastFormValues => ({
  contentSource: "text",
  content: "",
  url: "",
  grimoirePath: "",
  title: "",
  format: "conversation",
  duration: "5min",
  tone: "educational",
  voices: "luna_and_sol",
  tts: "voicebox",
  llm: "ollama",
  includeMusic: false,
  instructions: "",
});
export function briefProblem(form: PodcastFormValues): string | null {
  if (form.contentSource === "text")
    return form.content.trim().length >= 50
      ? null
      : "Add at least 50 characters of source text.";
  if (form.contentSource === "grimoire")
    return /^\/grimoire\/[^\s]+$/.test(form.grimoirePath.trim())
      ? null
      : "Enter a Grimoire path beginning /grimoire/.";
  try {
    const url = new URL(form.url.trim());
    if (["https:", "http:"].includes(url.protocol)) return null;
  } catch {}
  return "Enter a complete http or https article URL.";
}
export function generationBody(form: PodcastFormValues) {
  const common = {
    format: form.format,
    duration: form.duration,
    tone: form.tone,
    voices: form.voices,
    tts: form.tts,
    llm: form.llm,
    includeMusic: form.includeMusic,
    instructions: form.instructions.trim() || undefined,
    title: form.title.trim() || undefined,
    async: true,
  };
  return {
    ...common,
    ...(form.contentSource === "text"
      ? { content: form.content.trim() }
      : form.contentSource === "url"
        ? { url: form.url.trim() }
        : { grimoire_path: form.grimoirePath.trim() }),
  };
}
export interface EpisodeResult {
  transcript: ScriptLine[];
  durationSeconds: number;
  wordCount: number;
  costUsd: number;
  audioUrl?: string;
}
interface BaseStatus {
  id: string;
  progress: number;
  stage: string | null;
  message: string;
}
export type JobSnapshot = BaseStatus &
  (
    | { status: "pending" | "processing" }
    | { status: "error"; error: string }
    | { status: "complete"; result: EpisodeResult }
  );
export type CompleteJob = Extract<JobSnapshot, { status: "complete" }>;
export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;
export function safeAudioUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || /[\u0000-\u0020\\]/.test(value)) return;
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  try {
    const url = new URL(value);
    if (
      ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
    )
      return url.href;
  } catch {}
}
export function parseJobSnapshot(value: unknown, jobId: string): JobSnapshot {
  if (
    !object(value) ||
    value.id !== jobId ||
    !["pending", "processing", "error", "complete"].includes(
      String(value.status),
    ) ||
    !finite(value.progress) ||
    typeof value.message !== "string" ||
    !(value.stage === null || typeof value.stage === "string")
  )
    throw new Error(
      "The status response was incomplete. Your job reference has been kept.",
    );
  const base = {
    id: jobId,
    progress: Math.min(100, value.progress),
    stage: value.stage,
    message: value.message,
  };
  if (value.status === "complete") {
    const result = value.result;
    if (
      !object(result) ||
      !finite(result.durationSeconds) ||
      !finite(result.wordCount) ||
      !Number.isInteger(result.wordCount) ||
      !finite(result.costUsd) ||
      !Array.isArray(result.transcript) ||
      !result.transcript.every(
        (line) =>
          object(line) &&
          ["HOST_A", "HOST_B"].includes(String(line.speaker)) &&
          typeof line.text === "string",
      )
    )
      throw new Error(
        "The episode result was incomplete. Check this job again before starting another.",
      );
    return {
      ...base,
      status: "complete",
      result: {
        transcript: result.transcript as ScriptLine[],
        durationSeconds: result.durationSeconds,
        wordCount: result.wordCount,
        costUsd: result.costUsd,
        audioUrl: safeAudioUrl(result.audioUrl) || safeAudioUrl(result.blobUrl),
      },
    };
  }
  if (value.status === "error")
    return {
      ...base,
      status: "error",
      error:
        typeof value.error === "string"
          ? value.error
          : "Generation could not finish.",
    };
  return { ...base, status: value.status as "pending" | "processing" };
}
async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
function responseError(response: Response, body: unknown, fallback: string) {
  return new Error(
    object(body) && typeof body.error === "string" && body.error.trim()
      ? body.error.slice(0, 500)
      : response.status === 401
        ? "Your sign-in needs checking. The brief is still in this tab."
        : `${fallback} (HTTP ${response.status}).`,
  );
}
export async function requestJob(
  form: PodcastFormValues,
  fetcher: Fetcher,
  signal: AbortSignal,
): Promise<string> {
  const problem = briefProblem(form);
  if (problem) throw new Error(problem);
  let response: Response;
  try {
    response = await fetcher("/api/podcast/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(generationBody(form)),
      signal,
    });
  } catch (error) {
    if (signal.aborted)
      throw new Error(
        "The request was interrupted or timed out. It may still have been created; check the feed before trying again. Your brief is kept.",
      );
    throw new Error(
      "No acknowledgement arrived. The request may have been created; check the feed before trying again. Your brief is kept in this tab.",
    );
  }
  const body = await readJson(response);
  if (!response.ok)
    throw responseError(
      response,
      body,
      "The generation request was not accepted",
    );
  if (
    !object(body) ||
    typeof body.jobId !== "string" ||
    !/^[a-zA-Z0-9_-]{1,128}$/.test(body.jobId)
  )
    throw new Error(
      "No valid job reference arrived. Check your sign-in and feed before submitting again. Your brief is kept.",
    );
  return body.jobId;
}
export async function requestProcessing(
  jobId: string,
  fetcher: Fetcher,
  signal: AbortSignal,
): Promise<void> {
  const response = await fetcher(
    `/api/podcast/process/${encodeURIComponent(jobId)}`,
    { method: "POST", signal },
  );
  if (response.status === 409) return; // Existing processing is observed, never started again.
  const body = await readJson(response);
  if (!response.ok)
    throw responseError(response, body, "Processing could not be confirmed");
  if (!object(body) || body.status !== "complete")
    throw new Error(
      "Processing returned an unrecognised response. Keep checking the existing job.",
    );
}
export function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}
export async function monitorJob(
  jobId: string,
  options: {
    fetcher: Fetcher;
    signal: AbortSignal;
    onSnapshot: (snapshot: JobSnapshot) => void;
    wait?: typeof delay;
    now?: () => number;
    maxMs?: number;
  },
): Promise<CompleteJob> {
  const { signal, fetcher, onSnapshot } = options,
    now = options.now ?? (() => performance.now()),
    started = now();
  while (!signal.aborted) {
    if (now() - started > (options.maxMs ?? 600000))
      throw new Error(
        "Status checking paused after ten minutes. The job may still be running; check it again rather than resubmitting.",
      );
    const requestController = new AbortController();
    const abort = () => requestController.abort(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    const timeout = setTimeout(
      () => requestController.abort(new Error("Status request timed out")),
      15000,
    );
    let response: Response, body: unknown;
    try {
      response = await fetcher(
        `/api/podcast/status/${encodeURIComponent(jobId)}`,
        { cache: "no-store", signal: requestController.signal },
      );
      body = await readJson(response);
      if (requestController.signal.aborted)
        throw requestController.signal.reason;
    } catch {
      if (signal.aborted) throw signal.reason;
      throw new Error(
        "The status request did not finish. Your job reference is kept; check it again when ready.",
      );
    } finally {
      clearTimeout(timeout);
      signal.removeEventListener("abort", abort);
    }
    if (signal.aborted) throw signal.reason;
    if (!response.ok)
      throw responseError(response, body, "The job status could not be read");
    const snapshot = parseJobSnapshot(body, jobId);
    onSnapshot(snapshot);
    if (snapshot.status === "complete") return snapshot;
    if (snapshot.status === "error") throw new Error(snapshot.error);
    await (options.wait ?? delay)(1000, signal);
  }
  throw signal.reason;
}
export function formatDuration(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "Duration unavailable";
  const total = Math.round(value);
  return `${Math.floor(total / 60)}m ${total % 60}s`;
}
export function formatEpisodeDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : date.toLocaleDateString("en-GB", {
        timeZone: "UTC",
        day: "numeric",
        month: "short",
        year: "numeric",
      });
}
