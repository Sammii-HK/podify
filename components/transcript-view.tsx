"use client";
import { useId, useState } from "react";
import { ChevronDown, FileText } from "lucide-react";
export default function TranscriptView({
  transcript,
}: {
  transcript: { speaker: string; text: string }[];
}) {
  const [expanded, setExpanded] = useState(false),
    id = useId(),
    lines = expanded ? transcript : transcript.slice(0, 8);
  return (
    <section className="transcript-panel" aria-labelledby={id + "-title"}>
      <div className="panel-top">
        <span className="section-label">Read along</span>
        <FileText aria-hidden size={19} />
      </div>
      <div className="transcript-heading">
        <h2 id={id + "-title"}>The conversation</h2>
        <span>{transcript.length} lines</span>
      </div>
      {!transcript.length ? (
        <p className="panel-copy">
          No transcript was supplied for this episode.
        </p>
      ) : (
        <ol id={id + "-lines"} className="transcript-lines">
          {lines.map((line, index) => (
            <li key={index}>
              <span>
                {line.speaker === "HOST_A"
                  ? "Host A"
                  : line.speaker === "HOST_B"
                    ? "Host B"
                    : line.speaker}
              </span>
              <p>{line.text}</p>
            </li>
          ))}
        </ol>
      )}
      {transcript.length > 8 && (
        <button
          type="button"
          className="text-button"
          aria-expanded={expanded}
          aria-controls={id + "-lines"}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded
            ? "Show fewer lines"
            : `Read all ${transcript.length} lines`}
          <ChevronDown aria-hidden size={15} />
        </button>
      )}
    </section>
  );
}
