"use client";

import { useEffect, useState } from "react";

interface StatusResponse {
  id: string;
  status: "pending" | "processing" | "complete" | "error";
  progress: number;
  stage: string | null;
  message: string;
  result?: {
    transcript: { speaker: string; text: string }[];
    durationSeconds: number;
    wordCount: number;
    costUsd: number;
  };
  error?: string;
}

const STAGE_LABELS: Record<string, string> = {
  scripting: "Writing script",
  audio: "Generating audio",
  assembly: "Assembling podcast",
  complete: "Complete",
};

export default function GenerationProgress({
  jobId,
  onComplete,
  onError,
}: {
  jobId: string;
  onComplete: (data: StatusResponse) => void;
  onError: (error: string) => void;
}) {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [elapsed, setElapsed] = useState(0);

  // Timer
  useEffect(() => {
    const interval = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  // Polling
  useEffect(() => {
    let active = true;

    async function poll() {
      while (active) {
        try {
          const res = await fetch(`/api/podcast/status/${jobId}`);
          if (!res.ok) {
            onError("Failed to fetch job status");
            return;
          }
          const data: StatusResponse = await res.json();
          setStatus(data);

          if (data.status === "complete") {
            onComplete(data);
            return;
          }
          if (data.status === "error") {
            onError(data.error || "Generation failed");
            return;
          }
        } catch {
          onError("Network error while polling status");
          return;
        }

        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    poll();
    return () => {
      active = false;
    };
  }, [jobId, onComplete, onError]);

  const progress = status?.progress || 0;
  const stage = status?.stage ? STAGE_LABELS[status.stage] || status.stage : "Starting...";
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm">
        <span className="text-foreground">{stage}</span>
        <span className="tabular-nums text-muted">
          {minutes}:{String(seconds).padStart(2, "0")}
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-2 overflow-hidden rounded-full bg-card-border">
        <div
          className="h-full rounded-full bg-accent transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      <p className="text-xs text-muted">
        {status?.message || "Preparing..."}
      </p>
    </div>
  );
}
