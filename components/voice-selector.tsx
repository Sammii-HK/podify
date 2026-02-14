"use client";

const PRESETS = [
  {
    key: "luna_and_sol",
    label: "Luna & Sol",
    desc: "Two warm female voices",
    hosts: "af_heart + af_sarah",
  },
  {
    key: "mixed_gender",
    label: "Mixed",
    desc: "Female + male pair",
    hosts: "af_heart + am_michael",
  },
  {
    key: "british_pair",
    label: "British",
    desc: "British female + male",
    hosts: "bf_emma + bm_george",
  },
  {
    key: "solo_warm",
    label: "Solo Warm",
    desc: "Single narrator (warm)",
    hosts: "af_heart",
  },
  {
    key: "solo_british",
    label: "Solo British",
    desc: "Single narrator (British)",
    hosts: "bf_emma",
  },
] as const;

export default function VoiceSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {PRESETS.map((p) => (
        <button
          key={p.key}
          type="button"
          onClick={() => onChange(p.key)}
          className={`rounded-lg border p-3 text-left text-sm transition-colors ${
            value === p.key
              ? "border-accent bg-accent/10 text-accent"
              : "border-card-border bg-card hover:border-muted"
          }`}
        >
          <div className="font-medium">{p.label}</div>
          <div className="mt-0.5 text-xs text-muted">{p.desc}</div>
        </button>
      ))}
    </div>
  );
}
