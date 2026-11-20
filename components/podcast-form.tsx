"use client";
import { useId } from "react";
import { ArrowRight, FileText, Link, BookOpen } from "lucide-react";
import VoiceSelector from "./voice-selector";
import { briefProblem, type PodcastFormValues } from "@/lib/client-workflow";
export default function PodcastForm({
  value,
  onChange,
  onSubmit,
  disabled = false,
  review = false,
}: {
  value: PodcastFormValues;
  onChange: (value: PodcastFormValues) => void;
  onSubmit: (value: PodcastFormValues) => void;
  disabled?: boolean;
  review?: boolean;
}) {
  const id = useId(),
    set = <K extends keyof PodcastFormValues>(
      key: K,
      val: PodcastFormValues[K],
    ) => onChange({ ...value, [key]: val });
  const sourceId = id + "-source",
    problem = briefProblem(value);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!disabled && !problem) onSubmit(value);
      }}
      className="brief-form"
    >
      <fieldset disabled={disabled} className="form-fields">
        <legend className="section-label">01 / Your source</legend>
        <div
          className="source-options"
          role="group"
          aria-label="Content source"
        >
          {(
            [
              ["text", "Paste text", FileText],
              ["url", "Article URL", Link],
              ["grimoire", "Grimoire", BookOpen],
            ] as const
          ).map(([key, label, Icon]) => (
            <button
              type="button"
              key={key}
              aria-pressed={value.contentSource === key}
              onClick={() => set("contentSource", key)}
            >
              <Icon aria-hidden size={16} />
              {label}
            </button>
          ))}
        </div>
        <label htmlFor={sourceId}>
          {value.contentSource === "text"
            ? "Source text"
            : value.contentSource === "url"
              ? "Article URL"
              : "Grimoire path"}
        </label>
        {value.contentSource === "text" ? (
          <textarea
            id={sourceId}
            value={value.content}
            onChange={(event) => set("content", event.target.value)}
            rows={7}
            placeholder="A piece you wrote, a passage worth discussing, something you want to hear differently…"
            aria-describedby={id + "-source-help"}
          />
        ) : (
          <input
            id={sourceId}
            type={value.contentSource === "url" ? "url" : "text"}
            value={
              value.contentSource === "url" ? value.url : value.grimoirePath
            }
            onChange={(event) =>
              value.contentSource === "url"
                ? set("url", event.target.value)
                : set("grimoirePath", event.target.value)
            }
            placeholder={
              value.contentSource === "url"
                ? "https://example.com/article"
                : "/grimoire/witch-types/kitchen-witch"
            }
            aria-describedby={id + "-source-help"}
          />
        )}
        <div className="field-note" id={id + "-source-help"}>
          <span>
            {value.contentSource === "text"
              ? "At least 50 characters. Use material you are happy to send for generation."
              : value.contentSource === "url"
                ? "Use the complete address of the article."
                : "Use a path from Lunary’s Grimoire."}
          </span>
          {value.contentSource === "text" && (
            <span>
              {value.content.trim().length.toLocaleString()} characters
            </span>
          )}
        </div>
        <div className="field">
          <label htmlFor={id + "-title"}>
            Episode title <span>optional</span>
          </label>
          <input
            id={id + "-title"}
            value={value.title}
            onChange={(event) => set("title", event.target.value)}
            placeholder="Give this listen a name"
          />
        </div>
        <div className="section-heading">
          <span className="section-label">02 / Shape the conversation</span>
        </div>
        <div className="settings-grid">
          {(
            [
              {
                key: "format",
                label: "Format",
                options: [
                  ["conversation", "Conversation"],
                  ["interview", "Interview"],
                  ["solo_narration", "Solo narration"],
                  ["study_notes", "Study notes"],
                ],
              },
              {
                key: "duration",
                label: "Target length",
                options: [
                  ["5min", "5 minutes"],
                  ["10min", "10 minutes"],
                  ["15min", "15 minutes"],
                ],
              },
              {
                key: "tone",
                label: "Tone",
                options: [
                  ["educational", "Educational"],
                  ["casual", "Casual"],
                  ["deep_dive", "Deep dive"],
                  ["mystical", "Mystical"],
                ],
              },
            ] as const
          ).map((field) => (
            <div className="field" key={field.key}>
              <label htmlFor={id + "-" + field.key}>{field.label}</label>
              <select
                id={id + "-" + field.key}
                value={value[field.key]}
                onChange={(event) =>
                  set(
                    field.key,
                    event.target.value as PodcastFormValues[typeof field.key],
                  )
                }
              >
                {field.options.map(([key, label]) => (
                  <option value={key} key={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
        <p className="field-note">
          The finished length can vary from the target.
        </p>
        <fieldset className="voice-field">
          <legend>Voices</legend>
          <VoiceSelector
            value={value.voices}
            onChange={(voice) => set("voices", voice)}
          />
        </fieldset>
        <details className="direction-details">
          <summary>Fine-tune the direction</summary>
          <label htmlFor={id + "-instructions"}>
            Instructions <span>optional</span>
          </label>
          <textarea
            id={id + "-instructions"}
            value={value.instructions}
            onChange={(event) => set("instructions", event.target.value)}
            rows={3}
            placeholder="What should the hosts focus on?"
          />
          <label className="check-field">
            <input
              type="checkbox"
              checked={value.includeMusic}
              onChange={(event) => set("includeMusic", event.target.checked)}
            />
            Include background music
          </label>
        </details>
        <button
          type="submit"
          className="primary-button generate-button"
          disabled={disabled || !!problem}
        >
          {review
            ? "Review this brief"
            : disabled
              ? "Brief in use"
              : "Generate episode"}
          <ArrowRight aria-hidden size={17} />
        </button>
        <p className="submit-note">
          {review
            ? "Offline review only. No generation request will be sent."
            : (problem ??
              "Generation uses the configured script and voice services. Your brief stays in this tab if a request fails.")}
        </p>
      </fieldset>
    </form>
  );
}
