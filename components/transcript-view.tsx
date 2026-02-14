"use client";

import { useState } from "react";

interface Line {
  speaker: string;
  text: string;
}

export default function TranscriptView({
  transcript,
}: {
  transcript: Line[];
}) {
  const [expanded, setExpanded] = useState(false);
  const lines = expanded ? transcript : transcript.slice(0, 8);

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-muted">Transcript</h3>

      <div className="space-y-2">
        {lines.map((line, i) => {
          const isA = line.speaker === "HOST_A";
          return (
            <div
              key={i}
              className={`flex ${isA ? "justify-start" : "justify-end"}`}
            >
              <div
                className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                  isA
                    ? "bg-accent/10 text-foreground"
                    : "bg-card text-foreground"
                }`}
              >
                <span className="mb-0.5 block text-[10px] font-semibold uppercase text-muted">
                  {line.speaker === "HOST_A" ? "Host A" : "Host B"}
                </span>
                {line.text}
              </div>
            </div>
          );
        })}
      </div>

      {transcript.length > 8 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-accent hover:underline"
        >
          {expanded
            ? "Show less"
            : `Show all ${transcript.length} lines`}
        </button>
      )}
    </div>
  );
}
