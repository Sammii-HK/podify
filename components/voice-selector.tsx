"use client";
import { useId } from "react";
import { Check, Mic2 } from "lucide-react";
import { VOICE_PRESETS } from "@/lib/types";
const choices = [
  ["luna_and_sol", "Two warm voices"],
  ["mixed_gender", "A mixed voice pair"],
  ["british_pair", "A British voice pair"],
  ["solo_warm", "One warm narrator"],
  ["solo_british", "One British narrator"],
] as const;
export default function VoiceSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div className="voice-grid">
      {choices.map(([key, description]) => {
        const preset = VOICE_PRESETS[key];
        const label =
          "host_b" in preset
            ? `${preset.host_a.name} & ${preset.host_b.name}`
            : preset.host_a.name;
        return (
          <label
            className={`voice-card ${value === key ? "selected" : ""}`}
            key={key}
          >
            <input
              type="radio"
              name={id}
              value={key}
              checked={value === key}
              onChange={() => onChange(key)}
            />
            <Mic2 aria-hidden size={19} />
            <span>
              <strong>{label}</strong>
              <small>{description}</small>
            </span>
            {value === key && (
              <Check className="voice-check" aria-hidden size={15} />
            )}
          </label>
        );
      })}
    </div>
  );
}
