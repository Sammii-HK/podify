"use client";
import { useEffect, useState } from "react";
import { AudioLines, Check, Circle, Pause } from "lucide-react";
import {
  monitorJob,
  type JobSnapshot,
  type CompleteJob,
  type Fetcher,
} from "@/lib/client-workflow";
const stages = [
  ["scripting", "Script", "Shaping the conversation"],
  ["audio", "Voices", "Turning the script into speech"],
  ["assembly", "Assembly", "Bringing the episode together"],
] as const;
export function ProgressDisplay({
  snapshot,
  elapsed = 0,
  onStop,
}: {
  snapshot: JobSnapshot | null;
  elapsed?: number;
  onStop?: () => void;
}) {
  const index = stages.findIndex(([key]) => key === snapshot?.stage),
    progress = snapshot?.progress ?? 0;
  return (
    <section className="progress-panel" aria-labelledby="progress-title">
      <div className="panel-top">
        <span className="section-label">In the studio</span>
        <AudioLines aria-hidden size={21} />
      </div>
      <h2 id="progress-title">One episode, taking shape.</h2>
      <p className="panel-copy">
        {snapshot?.message || "Waiting for the first job update."}
      </p>
      <div
        className="progress-track"
        role="progressbar"
        aria-label="Reported generation progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={snapshot ? progress : undefined}
      >
        <span style={{ width: `${progress}%` }} />
      </div>
      <div className="progress-meta">
        <span>
          {snapshot
            ? `${Math.round(progress)}% reported`
            : "Awaiting a job update"}
        </span>
        <span>
          {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}{" "}
          checking
        </span>
      </div>
      <ol className="stage-list">
        {stages.map(([key, label, description], n) => (
          <li
            key={key}
            className={n === index ? "current" : n < index ? "finished" : ""}
            aria-current={n === index ? "step" : undefined}
          >
            {n < index ? (
              <Check aria-hidden size={18} />
            ) : (
              <Circle aria-hidden size={18} />
            )}
            <div>
              <strong>{label}</strong>
              <span>{description}</span>
            </div>
          </li>
        ))}
      </ol>
      <p className="panel-note">
        Progress is reported by the job, not an estimate of time remaining.
      </p>
      {onStop && (
        <button type="button" className="text-button" onClick={onStop}>
          <Pause aria-hidden size={15} />
          Stop checking in this tab
        </button>
      )}
    </section>
  );
}
export default function GenerationProgress({
  jobId,
  onComplete,
  onError,
  onStop,
  fetcher = fetch,
}: {
  fetcher?: Fetcher;
  jobId: string;
  onComplete: (job: CompleteJob) => void;
  onError: (message: string) => void;
  onStop: () => void;
}) {
  const [snapshot, setSnapshot] = useState<JobSnapshot | null>(null),
    [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const controller = new AbortController(),
      started = performance.now();
    setSnapshot(null);
    setElapsed(0);
    const timer = setInterval(
      () => setElapsed(Math.floor((performance.now() - started) / 1000)),
      1000,
    );
    monitorJob(jobId, {
      fetcher,
      signal: controller.signal,
      onSnapshot: setSnapshot,
    })
      .then((job) => {
        if (!controller.signal.aborted) onComplete(job);
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          onError(
            error instanceof Error
              ? error.message
              : "The status could not be checked. Your job reference is kept.",
          );
      });
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [jobId, onComplete, onError, fetcher]);
  return (
    <ProgressDisplay snapshot={snapshot} elapsed={elapsed} onStop={onStop} />
  );
}
