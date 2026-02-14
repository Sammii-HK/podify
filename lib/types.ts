// ============================================================
// Lunary Podcast Pipeline — Types
// ============================================================

export interface PodcastConfig {
  /** Source content to turn into a podcast */
  content: string;

  /** Episode title */
  title: string;

  /** Podcast format */
  format: "conversation" | "interview" | "solo_narration" | "study_notes";

  /** Target duration */
  duration: "5min" | "10min" | "15min";

  /** Tone of the episode */
  tone: "educational" | "casual" | "deep_dive" | "mystical";

  /** Voice configuration */
  voices: {
    host_a: VoiceConfig;
    host_b?: VoiceConfig; // Optional for solo_narration
  };

  /** TTS provider */
  ttsProvider: "deepinfra" | "inference" | "openai";

  /** LLM provider for script generation */
  llmProvider: "openrouter" | "inference";

  /** Include ambient background music */
  includeMusic: boolean;

  /** Custom instructions for the script generator */
  customInstructions?: string;

  /** Content source: "grimoire", "url", "text" */
  source?: string;
}

export interface VoiceConfig {
  id: string;
  name: string;
}

export interface ScriptLine {
  speaker: "HOST_A" | "HOST_B";
  text: string;
}

export interface AudioClip {
  speaker: "HOST_A" | "HOST_B";
  filePath: string;
  durationMs: number;
}

export interface PodcastResult {
  /** Path to final MP3 */
  audioPath: string;

  /** Full transcript */
  transcript: ScriptLine[];

  /** Duration in seconds */
  durationSeconds: number;

  /** Total word count */
  wordCount: number;

  /** Estimated cost in USD */
  costUsd: number;
}

// ============================================================
// Voice presets
// ============================================================

export const VOICE_PRESETS = {
  // Recommended pairs
  luna_and_sol: {
    host_a: { id: "af_heart", name: "Luna" },
    host_b: { id: "af_bella", name: "Sol" },
  },
  mixed_gender: {
    host_a: { id: "af_heart", name: "Luna" },
    host_b: { id: "am_michael", name: "Sol" },
  },
  british_pair: {
    host_a: { id: "bf_emma", name: "Luna" },
    host_b: { id: "bm_george", name: "Sol" },
  },
  // Solo narration
  solo_warm: {
    host_a: { id: "af_heart", name: "Narrator" },
  },
  solo_british: {
    host_a: { id: "bf_emma", name: "Narrator" },
  },
} as const;

// ============================================================
// Duration targets (approximate word counts)
// ============================================================

export const DURATION_WORDS: Record<string, number> = {
  "5min": 750,
  "10min": 1500,
  "15min": 2250,
};

// ============================================================
// RSS Feed / Episode manifest types
// ============================================================

export interface EpisodeMeta {
  guid: string;           // crypto.randomUUID(), immutable
  slug: string;           // "kitchen-witchcraft-101"
  dirName: string;        // "2026-02-14_kitchen-witchcraft-101"
  title: string;
  description: string;    // LLM-generated 2-3 sentence summary
  pubDate: string;        // ISO 8601
  durationSeconds: number;
  fileSizeBytes: number;  // For RSS <enclosure length>
  audioFileName: string;  // "kitchen-witchcraft-101.mp3"
  wordCount: number;
  costUsd: number;
  blobUrl?: string;       // Vercel Blob URL for the MP3
  source?: string;        // Content source: "grimoire", "url", "text"
}

export interface ShowConfig {
  title: string;
  description: string;
  link: string;
  language: string;
  author: string;
  email: string;
  imageUrl: string;
  category: string;
  explicit: boolean;
}

export interface FeedManifest {
  show: ShowConfig;
  episodes: EpisodeMeta[];
}
