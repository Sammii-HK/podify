"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  AudioLines,
  Check,
  FileText,
  RotateCcw,
} from "lucide-react";
import PodcastForm from "./podcast-form";
import GenerationProgress from "./generation-progress";
import PodcastPlayer from "./podcast-player";
import TranscriptView from "./transcript-view";
import PodifyShell from "./podify-shell";
import {
  defaultBrief,
  requestJob,
  requestProcessing,
  type CompleteJob,
  type PodcastFormValues,
} from "@/lib/client-workflow";
import type { Fetcher } from "@/lib/client-workflow";
type State =
  | { phase: "idle"; error?: string }
  | { phase: "submitting" }
  | { phase: "monitoring"; jobId: string; warning?: string }
  | { phase: "paused"; jobId: string; message?: string }
  | { phase: "complete"; job: CompleteJob };
export default function PodifyWorkspace({
  fetcher = fetch,
}: {
  fetcher?: Fetcher;
}) {
  const [brief, setBrief] = useState(defaultBrief),
    [state, setState] = useState<State>({ phase: "idle" }),
    pending = useRef(false),
    alive = useRef(true),
    controllers = useRef(new Set<AbortController>()),
    heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      for (const controller of controllers.current) controller.abort();
      controllers.current.clear();
    };
  }, []);
  useEffect(() => {
    if (state.phase === "complete" || state.phase === "paused")
      heading.current?.focus();
  }, [state.phase]);
  async function submit(form: PodcastFormValues) {
    if (pending.current) return;
    pending.current = true;
    setState({ phase: "submitting" });
    const controller = new AbortController();
    controllers.current.add(controller);
    try {
      const jobId = await requestJob(
        form,
        fetcher,
        AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]),
      );
      if (!alive.current) return;
      setState({ phase: "monitoring", jobId });
      // Keep the process connection open independently from status observation.
      const processController = new AbortController();
      controllers.current.add(processController);
      requestProcessing(
        jobId,
        fetcher,
        AbortSignal.any([
          processController.signal,
          AbortSignal.timeout(330000),
        ]),
      )
        .catch(() => {
          if (alive.current)
            setState((current) =>
              current.phase === "monitoring" && current.jobId === jobId
                ? {
                    ...current,
                    warning:
                      "Processing could not be confirmed. We are still checking the saved job; do not submit it again.",
                  }
                : current,
            );
        })
        .finally(() => controllers.current.delete(processController));
    } catch (error) {
      if (alive.current)
        setState({
          phase: "idle",
          error: controller.signal.aborted
            ? "The request was interrupted. It may still have been created; check the feed before trying again."
            : error instanceof Error
              ? error.message
              : "The request could not be confirmed. Your brief is kept.",
        });
    } finally {
      pending.current = false;
      controllers.current.delete(controller);
    }
  }
  const complete = useCallback(
    (job: CompleteJob) =>
      setState((current) =>
        current.phase === "monitoring" && current.jobId === job.id
          ? { phase: "complete", job }
          : current,
      ),
    [],
  );
  const failed = useCallback(
    (message: string) =>
      setState((current) =>
        current.phase === "monitoring"
          ? { phase: "paused", jobId: current.jobId, message }
          : current,
      ),
    [],
  );
  const busy = state.phase !== "idle";
  return (
    <PodifyShell>
      <main id="main" className="studio-main">
        <header className="studio-hero">
          <div>
            <p className="eyebrow">A change of medium</p>
            <h1>
              Your words.
              <br />
              <span>A different way in.</span>
            </h1>
          </div>
          <p>
            Shape a conversation from something worth hearing. Choose your
            source, set the direction, then follow the episode into voices and
            sound.
          </p>
        </header>
        <div className="workspace-grid">
          <section className="brief-panel" aria-label="Episode brief">
            <div className="panel-top">
              <span className="section-label">The brief</span>
              <FileText aria-hidden size={20} />
            </div>
            {state.phase === "idle" && state.error && (
              <div className="notice error" role="alert">
                <strong>The request needs a check.</strong>
                <span>{state.error}</span>
              </div>
            )}
            <PodcastForm
              value={brief}
              onChange={setBrief}
              onSubmit={submit}
              disabled={busy}
            />
          </section>
          <div className="output-column">
            {state.phase === "idle" || state.phase === "submitting" ? (
              <section className="studio-aside">
                <AudioLines aria-hidden size={36} />
                <h2>
                  {state.phase === "submitting"
                    ? "Sending the brief."
                    : "A little space to listen."}
                </h2>
                <p>
                  {state.phase === "submitting"
                    ? "Waiting for a job reference. Your source stays here."
                    : "Start with your own text, an article or a Grimoire page. The source gives the episode its substance; your choices give it a shape."}
                </p>
                <ol>
                  <li>
                    <span>01</span>Choose the material
                  </li>
                  <li>
                    <span>02</span>Find the right voices
                  </li>
                  <li>
                    <span>03</span>Listen and read along
                  </li>
                </ol>
                <a href="/feed">
                  Visit the episode feed
                  <ArrowUpRight aria-hidden size={16} />
                </a>
              </section>
            ) : state.phase === "monitoring" ? (
              <>
                {state.warning && (
                  <div className="notice" role="status">
                    {state.warning}
                  </div>
                )}
                <GenerationProgress
                  key={state.jobId}
                  jobId={state.jobId}
                  fetcher={fetcher}
                  onComplete={complete}
                  onError={failed}
                  onStop={() =>
                    setState({
                      phase: "paused",
                      jobId: state.jobId,
                      message:
                        "Status checking is paused in this tab. The job may continue on the server.",
                    })
                  }
                />
              </>
            ) : state.phase === "paused" ? (
              <section className="recovery-panel">
                <span className="section-label">Job reference kept</span>
                <h2 ref={heading} tabIndex={-1}>
                  Keep your place.
                </h2>
                <p>{state.message}</p>
                <code className="job-reference">{state.jobId}</code>
                <button
                  type="button"
                  className="primary-button"
                  onClick={() =>
                    setState({ phase: "monitoring", jobId: state.jobId })
                  }
                >
                  <RotateCcw aria-hidden size={16} />
                  Check this job again
                </button>
                <p className="panel-note">
                  This checks the existing job. It does not request another
                  generation.
                </p>
                <button
                  type="button"
                  className="text-button"
                  onClick={() =>
                    setState({
                      phase: "idle",
                      error: `Job ${state.jobId} may still exist. Returning to the brief does not cancel it; check the feed before requesting another episode.`,
                    })
                  }
                >
                  Return to the kept brief
                </button>
              </section>
            ) : (
              <>
                <div className="result-heading">
                  <span>
                    <Check aria-hidden size={16} />
                    Episode ready
                  </span>
                  <h2 ref={heading} tabIndex={-1}>
                    {brief.title.trim() || "Your episode"}
                  </h2>
                </div>
                <PodcastPlayer jobId={state.job.id} {...state.job.result} />
                <TranscriptView transcript={state.job.result.transcript} />
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setState({ phase: "idle" })}
                >
                  Edit this brief for another episode
                </button>
              </>
            )}
          </div>
        </div>
      </main>
    </PodifyShell>
  );
}
