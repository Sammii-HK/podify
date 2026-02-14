"use client";

import { useState, useCallback } from "react";
import PodcastForm from "@/components/podcast-form";
import GenerationProgress from "@/components/generation-progress";
import PodcastPlayer from "@/components/podcast-player";
import TranscriptView from "@/components/transcript-view";

type AppState =
  | { phase: "idle" }
  | { phase: "generating"; jobId: string }
  | {
      phase: "complete";
      jobId: string;
      transcript: { speaker: string; text: string }[];
      durationSeconds: number;
      wordCount: number;
      costUsd: number;
    }
  | { phase: "error"; message: string };

export default function Home() {
  const [state, setState] = useState<AppState>({ phase: "idle" });

  async function handleSubmit(form: any) {
    try {
      const body: Record<string, any> = {
        format: form.format,
        duration: form.duration,
        tone: form.tone,
        voices: form.voices,
        tts: form.tts,
        llm: form.llm,
        includeMusic: form.includeMusic,
        instructions: form.instructions || undefined,
        title: form.title || undefined,
      };

      if (form.contentSource === "text") body.content = form.content;
      else if (form.contentSource === "url") body.url = form.url;
      else body.grimoire_path = form.grimoirePath;

      const res = await fetch("/api/podcast/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        setState({ phase: "error", message: err.error || "Request failed" });
        return;
      }

      const { jobId } = await res.json();
      setState({ phase: "generating", jobId });
    } catch {
      setState({ phase: "error", message: "Network error" });
    }
  }

  const handleComplete = useCallback((data: any) => {
    setState({
      phase: "complete",
      jobId: data.id,
      transcript: data.result.transcript,
      durationSeconds: data.result.durationSeconds,
      wordCount: data.result.wordCount,
      costUsd: data.result.costUsd,
    });
  }, []);

  const handleError = useCallback((message: string) => {
    setState({ phase: "error", message });
  }, []);

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <header className="mb-10 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Podify
        </h1>
        <p className="mt-2 text-sm text-muted">
          Turn any content into a podcast episode with AI
        </p>
      </header>

      {state.phase === "idle" && <PodcastForm onSubmit={handleSubmit} />}

      {state.phase === "generating" && (
        <div className="rounded-xl border border-card-border bg-card p-6">
          <GenerationProgress
            jobId={state.jobId}
            onComplete={handleComplete}
            onError={handleError}
          />
        </div>
      )}

      {state.phase === "complete" && (
        <div className="space-y-6">
          <div className="rounded-xl border border-card-border bg-card p-6">
            <PodcastPlayer
              jobId={state.jobId}
              durationSeconds={state.durationSeconds}
              wordCount={state.wordCount}
              costUsd={state.costUsd}
            />
          </div>

          <div className="rounded-xl border border-card-border bg-card p-6">
            <TranscriptView transcript={state.transcript} />
          </div>

          <button
            onClick={() => setState({ phase: "idle" })}
            className="w-full rounded-lg border border-card-border px-4 py-3 text-sm text-muted transition-colors hover:border-accent hover:text-accent"
          >
            Generate Another
          </button>
        </div>
      )}

      {state.phase === "error" && (
        <div className="rounded-xl border border-error/30 bg-error/5 p-6 text-center">
          <p className="mb-4 text-sm text-error">{state.message}</p>
          <button
            onClick={() => setState({ phase: "idle" })}
            className="rounded-lg bg-accent px-4 py-2 text-sm text-white hover:bg-accent-hover"
          >
            Try Again
          </button>
        </div>
      )}
    </main>
  );
}
