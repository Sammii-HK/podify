# Podify

AI podcast generator that turns any content into natural two-host conversational audio. Includes a web UI, a CLI, and an RSS feed. Think NotebookLM but self-hosted, at roughly $0.04 per episode.

Built for generating podcast episodes from [Lunary's](https://lunary.app) grimoire content, though it works with any text, URL, or local file.

---

## What it does

Podify takes a piece of content (raw text, a URL, or a Lunary grimoire path) and turns it into a fully produced podcast episode:

- A structured dialogue script is written by local Ollama by default
- Each line is converted to speech using local Voicebox/Kokoro by default
- ffmpeg assembles the clips with silence gaps, optional background music, and optional intro/outro
- The result is an MP3 with a matching transcript, registered in an RSS feed

The web app uses an async job queue: submitting a form returns a `jobId` immediately, and the UI polls for progress every second until the episode is ready.

---

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| Frontend | React 19, Tailwind CSS 4 |
| Script generation | Local Ollama by default (or Brand API, DeepInfra, OpenRouter, or inference.sh) |
| TTS | Voicebox/Kokoro locally (or DeepInfra, inference.sh, or OpenAI TTS by explicit override) |
| Audio assembly | ffmpeg (via ffmpeg-static) |
| Storage | Local filesystem + optional Vercel Blob |
| Auth | HMAC-signed session cookies + optional API key |
| Runtime | Node.js 20+ |

---

## How the pipeline works

```
Content (text / URL / grimoire path)
  → fetch-content.ts: fetches and strips HTML to plain text
  → generate-script.ts: LLM generates a dialogue script as a JSON array
  → generate-audio.ts: each script line is sent to local Voicebox/Kokoro
  → assemble-podcast.ts: ffmpeg normalises clips to 44.1kHz stereo WAV, concatenates
      with silence gaps (800ms between speakers, 300ms same speaker),
      optionally mixes in background music at 10% volume,
      optionally prepends/appends intro and outro files
  → final MP3 at 192kbps + transcript.json + transcript.txt
  → feed.ts: episode metadata registered in feed.json (or Vercel Blob)
```

The LLM is prompted with a format-specific system prompt that defines host personas, episode structure, tone, and word target. Stage directions like `[laughs]` are stripped before TTS. Esoteric words that Kokoro mispronounces (grimoire, samhain, athame, etc.) are replaced with phonetic spellings before synthesis, while the saved transcript keeps correct spelling.

---

## Cost

| Duration | Target words | Est. generation time | Est. cost |
|---|---|---|---|
| 5 min | 750 | 30–60 s | ~$0.04 |
| 10 min | 1,500 | 60–120 s | ~$0.05 |
| 15 min | 2,250 | 90–180 s | ~$0.06 |

Cost breakdown:

| Component | Rate | Notes |
|---|---|---|
| Script via Ollama or Brand API | $0.00 | Default local path |
| Script via DeepInfra | varies by model | Explicit hosted override, controlled by `DEEPINFRA_LLM_MODEL` |
| TTS via Voicebox/Kokoro | $0.00 | Default local path |
| TTS via DeepInfra (Kokoro) | $0.62/1M chars | Explicit paid override |
| TTS via OpenAI | $15.00/1M chars | Higher quality, much higher cost |
| Audio assembly (ffmpeg) | $0.00 | Runs locally |

---

## Podcast formats

| Format | Description |
|---|---|
| `conversation` | Two co-hosts exploring a topic together. Default for grimoire content. |
| `interview` | One host interviews an expert guest |
| `solo_narration` | Single narrator, documentary-style |
| `study_notes` | Teacher-and-student dialogue, designed for comprehension |

---

## Voice presets

| Preset | Host A | Host B | Style |
|---|---|---|---|
| `luna_and_sol` | af_heart (warm F) | af_aoede (clear F) | Two female hosts, default |
| `mixed_gender` | af_heart (warm F) | am_michael (M) | Mixed pair |
| `british_pair` | bf_emma (British F) | bm_george (British M) | British pair |
| `solo_warm` | af_heart (warm F) | — | Solo narrator |
| `solo_british` | bf_emma (British F) | — | Solo narrator |

---

## Prerequisites

- Node.js 20+
- pnpm
- ffmpeg: `brew install ffmpeg` (macOS) or `apt install ffmpeg` (Linux)
- Voicebox running locally on `http://127.0.0.1:17493` for free TTS
- API keys only if you explicitly choose a hosted LLM or paid TTS fallback

---

## Local setup

```bash
pnpm install
cp .env.example .env.local
# Edit .env.local if you want hosted LLMs or paid fallback
pnpm dev
# Open http://localhost:3000
```

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `VOICEBOX_BASE_URL` | Optional | Local Voicebox URL for free TTS (default: `http://127.0.0.1:17493`) |
| `VOICEBOX_PROFILE_IDS` / `VOICEBOX_PROFILES` | Optional | Comma-separated Voicebox profile IDs or profile names for deterministic rotation. Mini defaults map Kokoro ids to `lunary-kokoro-*` profiles. |
| `PODIFY_TTS_PAID_FALLBACK` | Optional | Set to `1` to allow DeepInfra fallback if Voicebox fails. Default: `0` |
| `DEEPINFRA_API_KEY` | Optional | Hosted LLM provider and explicit paid TTS fallback/override |
| `DEEPINFRA_LLM_MODEL` | Optional | DeepInfra chat model for script generation (default: `deepseek-ai/DeepSeek-V3-0324`) |
| `OPENROUTER_API_KEY` | Optional | Alternative LLM provider for script generation |
| `INFERENCE_API_KEY` | Alternative | inference.sh as a unified LLM + TTS provider |
| `OPENAI_API_KEY` | Optional | OpenAI TTS as a fallback (higher cost) |
| `AUTH_SECRET` | Yes | Random 64-char hex string for session signing |
| `AUTH_USERNAME` | Yes | Login username (default: `admin`) |
| `AUTH_PASSWORD` | Yes | Login password |
| `API_KEY` | Optional | API key for programmatic access via `x-api-key` header |
| `LUNARY_BASE_URL` | Optional | Base URL for fetching grimoire content (default: `https://lunary.app`) |
| `BLOB_READ_WRITE_TOKEN` | Optional | Vercel Blob token; enables cloud storage for MP3s and job state |
| `OUTPUT_DIR` | Optional | Local output directory (default: `.podify-output`) |
| `MAX_EPISODES` | Optional | Max episodes kept in feed manifest before pruning (default: `60`) |
| `PODIFY_BASE_URL` | Optional | Public base URL used in RSS feed audio URLs |

---

## Web UI

The UI has three states:

1. **Form**: paste text, provide a URL, or enter a grimoire path. Choose format, duration, tone, and voice preset.
2. **Progress**: real-time progress bar with stage labels (scripting, audio, assembly) and elapsed time.
3. **Player**: audio player with download button, cost and duration metadata, and a chat-style transcript view.

The `/feed` route shows a feed preview of all generated episodes with links to audio and the RSS feed.

Authentication is enforced via middleware. The RSS feed endpoint (`/api/podcast/feed`) and permanent episode audio URLs (`/api/podcast/episodes/:slug/audio`) are public so podcast apps can subscribe.

---

## CLI

```bash
pnpm generate [options]
```

| Flag | Description | Default |
|---|---|---|
| `--text "..."` | Raw text content | — |
| `--url URL` | Fetch and extract content from a URL | — |
| `--grimoire PATH` | Lunary grimoire path (e.g. `/grimoire/tarot/the-fool`) | — |
| `--file PATH` | Local text or HTML file | — |
| `--batch FILE` | Text file with one URL or path per line | — |
| `--title "..."` | Episode title (auto-derived from source if omitted) | auto |
| `--format` | `conversation`, `interview`, `solo_narration`, `study_notes` | `conversation` |
| `--duration` | `5min`, `10min`, `15min` | `5min` |
| `--tone` | `educational`, `casual`, `deep_dive`, `mystical` | `educational` |
| `--voices` | `luna_and_sol`, `mixed_gender`, `british_pair`, `solo_warm`, `solo_british` | `luna_and_sol` |
| `--tts` | `voicebox`, `deepinfra`, `orpheus`, `inference`, `openai` | `voicebox` |
| `--llm` | `ollama`, `brandapi`, `deepinfra`, `openrouter`, `inference` | `ollama` |
| `--music` | Include background music | off |
| `--instructions "..."` | Custom instructions appended to the system prompt | — |
| `--rebuild-feed` | Rebuild `feed.json` from episodes on disk | — |

### Examples

```bash
# Single episode from a grimoire page
pnpm generate --grimoire "/grimoire/tarot/the-fool" --duration 5min --tone mystical

# From a URL
pnpm generate --url "https://example.com/article" --format interview

# Batch: generate one episode per line in grimoire-urls.txt
pnpm generate --batch grimoire-urls.txt --tone educational
```

Output is written to `OUTPUT_DIR` (default `.podify-output`):

```
.podify-output/
  feed.json
  2026-02-14_kitchen-witchcraft-abc123/
    kitchen-witchcraft-abc123.mp3
    transcript.json
    transcript.txt
```

---

## RSS feed

The RSS 2.0 feed with iTunes namespace extensions is available at `/api/podcast/feed`. Compatible with Apple Podcasts, Spotify, Pocket Casts, and most podcast apps. Submit the feed URL once and new episodes appear automatically.

---

## Project structure

```
podify/
  app/                        Next.js app
    page.tsx                  Main UI (form, progress, player)
    feed/                     Feed preview page
    api/podcast/
      generate/               POST: create generation job
      process/                POST: run generation pipeline
      status/                 GET: poll job status
      [jobId]/audio/          GET: stream job audio
      episodes/               GET: permanent audio by slug
      feed/                   GET: RSS 2.0 feed
  lib/
    pipeline.ts               Core orchestrator
    generate-script.ts        LLM script generation with format prompts
    generate-audio.ts         TTS synthesis (6 concurrent requests)
    assemble-podcast.ts       ffmpeg assembly, silence gaps, music mix
    fetch-content.ts          URL/grimoire/file content extraction
    feed.ts                   Episode manifest read/write/rebuild
    storage.ts                Filesystem vs Vercel Blob abstraction
    jobs.ts                   In-memory job queue with Blob persistence
    types.ts                  TypeScript types, voice presets, constants
  cli/
    main.ts                   CLI entrypoint
```

---

## Deployment

Runs as a standard Next.js app. On Vercel:

- Set `BLOB_READ_WRITE_TOKEN` to enable Vercel Blob for MP3 and job state storage (required for multi-instance deployments)
- Set `PODIFY_BASE_URL` to your production domain so RSS feed audio URLs resolve correctly
- Set `maxDuration = 300` in `next.config.ts` for the process route handler to handle long episodes
