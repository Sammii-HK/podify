"use client";

import { useState } from "react";
import VoiceSelector from "./voice-selector";

interface FormData {
  contentSource: "text" | "url" | "grimoire";
  content: string;
  url: string;
  grimoirePath: string;
  title: string;
  format: string;
  duration: string;
  tone: string;
  voices: string;
  tts: string;
  llm: string;
  includeMusic: boolean;
  instructions: string;
}

const FORMATS = [
  { value: "conversation", label: "Conversation" },
  { value: "interview", label: "Interview" },
  { value: "solo_narration", label: "Solo Narration" },
  { value: "study_notes", label: "Study Notes" },
];

const DURATIONS = [
  { value: "5min", label: "5 min" },
  { value: "10min", label: "10 min" },
  { value: "15min", label: "15 min" },
];

const TONES = [
  { value: "educational", label: "Educational" },
  { value: "casual", label: "Casual" },
  { value: "deep_dive", label: "Deep Dive" },
  { value: "mystical", label: "Mystical" },
];

export default function PodcastForm({
  onSubmit,
  disabled,
}: {
  onSubmit: (data: FormData) => void;
  disabled?: boolean;
}) {
  const [form, setForm] = useState<FormData>({
    contentSource: "text",
    content: "",
    url: "",
    grimoirePath: "",
    title: "",
    format: "conversation",
    duration: "5min",
    tone: "educational",
    voices: "luna_and_sol",
    tts: "deepinfra",
    llm: "openrouter",
    includeMusic: false,
    instructions: "",
  });

  const set = <K extends keyof FormData>(key: K, val: FormData[K]) =>
    setForm((f) => ({ ...f, [key]: val }));

  const hasContent =
    (form.contentSource === "text" && form.content.length >= 50) ||
    (form.contentSource === "url" && form.url.length > 0) ||
    (form.contentSource === "grimoire" && form.grimoirePath.length > 0);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(form);
      }}
      className="space-y-6"
    >
      {/* Content Source Tabs */}
      <div>
        <label className="mb-2 block text-sm font-medium text-muted">
          Content Source
        </label>
        <div className="mb-3 flex gap-1 rounded-lg bg-card p-1">
          {(["text", "url", "grimoire"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => set("contentSource", tab)}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm transition-colors ${
                form.contentSource === tab
                  ? "bg-accent/20 text-accent"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {tab === "text" ? "Paste Text" : tab === "url" ? "URL" : "Grimoire"}
            </button>
          ))}
        </div>

        {form.contentSource === "text" && (
          <textarea
            value={form.content}
            onChange={(e) => set("content", e.target.value)}
            placeholder="Paste your content here (min 50 characters)..."
            rows={6}
            className="w-full rounded-lg border border-card-border bg-card p-3 text-sm text-foreground placeholder:text-muted/60 focus:border-accent focus:outline-none"
          />
        )}
        {form.contentSource === "url" && (
          <input
            type="url"
            value={form.url}
            onChange={(e) => set("url", e.target.value)}
            placeholder="https://example.com/article"
            className="w-full rounded-lg border border-card-border bg-card p-3 text-sm text-foreground placeholder:text-muted/60 focus:border-accent focus:outline-none"
          />
        )}
        {form.contentSource === "grimoire" && (
          <input
            value={form.grimoirePath}
            onChange={(e) => set("grimoirePath", e.target.value)}
            placeholder="/grimoire/witch-types/kitchen-witch"
            className="w-full rounded-lg border border-card-border bg-card p-3 text-sm text-foreground placeholder:text-muted/60 focus:border-accent focus:outline-none"
          />
        )}
      </div>

      {/* Title */}
      <div>
        <label className="mb-2 block text-sm font-medium text-muted">
          Title <span className="text-muted/50">(optional)</span>
        </label>
        <input
          value={form.title}
          onChange={(e) => set("title", e.target.value)}
          placeholder="Auto-generated if blank"
          className="w-full rounded-lg border border-card-border bg-card p-3 text-sm text-foreground placeholder:text-muted/60 focus:border-accent focus:outline-none"
        />
      </div>

      {/* Format / Duration / Tone */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="mb-2 block text-sm font-medium text-muted">Format</label>
          <select
            value={form.format}
            onChange={(e) => set("format", e.target.value)}
            className="w-full rounded-lg border border-card-border bg-card p-2.5 text-sm text-foreground focus:border-accent focus:outline-none"
          >
            {FORMATS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-muted">Duration</label>
          <select
            value={form.duration}
            onChange={(e) => set("duration", e.target.value)}
            className="w-full rounded-lg border border-card-border bg-card p-2.5 text-sm text-foreground focus:border-accent focus:outline-none"
          >
            {DURATIONS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-muted">Tone</label>
          <select
            value={form.tone}
            onChange={(e) => set("tone", e.target.value)}
            className="w-full rounded-lg border border-card-border bg-card p-2.5 text-sm text-foreground focus:border-accent focus:outline-none"
          >
            {TONES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Voice Presets */}
      <div>
        <label className="mb-2 block text-sm font-medium text-muted">Voices</label>
        <VoiceSelector value={form.voices} onChange={(v) => set("voices", v)} />
      </div>

      {/* Custom Instructions */}
      <div>
        <label className="mb-2 block text-sm font-medium text-muted">
          Custom Instructions <span className="text-muted/50">(optional)</span>
        </label>
        <input
          value={form.instructions}
          onChange={(e) => set("instructions", e.target.value)}
          placeholder="e.g. Focus on practical tips, keep it light..."
          className="w-full rounded-lg border border-card-border bg-card p-3 text-sm text-foreground placeholder:text-muted/60 focus:border-accent focus:outline-none"
        />
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={disabled || !hasContent}
        className="w-full rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
      >
        Generate Podcast
      </button>
    </form>
  );
}
