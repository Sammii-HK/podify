# Podify

AI podcast generator that turns any content into natural two-host conversational audio. Includes a web UI and CLI. Think NotebookLM but self-hosted, at ~$0.04 per episode.

## Stack

- **Frontend** — Next.js 15 + React 19 + Tailwind CSS 4
- **Backend** — Next.js API routes, in-memory job queue
- **AI** — Claude Sonnet (script writing via OpenRouter) + Kokoro TTS (via DeepInfra)
- **Audio** — ffmpeg for assembly, silence injection, optional music mixing

## How It Works

```
Content (text / URL / grimoire path)
  → LLM generates dialogue script (JSON)
  → TTS converts each line to audio clips
  → ffmpeg assembles clips with pauses, optional music & intro/outro
  → Final MP3 + transcript
```

The web app uses fire-and-forget async generation: POST returns a `jobId` immediately, the frontend polls for progress every second.

## Quick Start

```bash
# Install
pnpm install

# Add API keys
cp .env.example .env.local
# Set OPENROUTER_API_KEY and DEEPINFRA_API_KEY

# Run web app
pnpm dev

# Or use the CLI
pnpm generate --text "Your content here..." --duration 5min
```

### Prerequisites

- Node.js 20+
- ffmpeg (`brew install ffmpeg`)
- API keys: [OpenRouter](https://openrouter.ai/) + [DeepInfra](https://deepinfra.com/)

## Cost

| Duration | Words | Est. Time | Est. Cost |
|----------|-------|-----------|-----------|
| 5 min | 750 | ~3–5 min | ~$0.04 |
| 10 min | 1,500 | ~7–10 min | ~$0.05 |
| 15 min | 2,250 | ~12–15 min | ~$0.06 |

Cost breakdown per episode:

| Component | Cost |
|-----------|------|
| Script generation (Claude Sonnet) | ~$0.03 |
| TTS (Kokoro via DeepInfra) | ~$0.006–0.03 |
| Audio assembly (ffmpeg) | $0.00 |

The LLM cost is roughly fixed. TTS scales with word count.

## Web App

Run `pnpm dev` and open the browser. The UI has three states:

1. **Form** — paste text, enter a URL, or provide a grimoire path. Pick format, duration, tone, and voice preset.
2. **Progress** — real-time progress bar with stage labels (scripting → audio → assembly) and elapsed time.
3. **Player** — audio player, download button, cost/duration metadata, and a chat-style transcript view.

## CLI

```bash
pnpm generate [options]
```

| Flag | Description | Default |
|------|-------------|---------|
| `--text "..."` | Raw text content | — |
| `--url URL` | Fetch content from URL | — |
| `--grimoire PATH` | Lunary grimoire path | — |
| `--file PATH` | Local file | — |
| `--batch FILE` | Batch file (one URL per line) | — |
| `--title "..."` | Episode title | auto |
| `--format` | `conversation` / `interview` / `solo_narration` / `study_notes` | `conversation` |
| `--duration` | `5min` / `10min` / `15min` | `5min` |
| `--tone` | `educational` / `casual` / `deep_dive` / `mystical` | `educational` |
| `--voices` | `luna_and_sol` / `mixed_gender` / `british_pair` / `solo_warm` / `solo_british` | `luna_and_sol` |
| `--tts` | `deepinfra` / `inference` / `openai` | `deepinfra` |
| `--llm` | `openrouter` / `inference` | `openrouter` |
| `--music` | Include background music | off |
| `--instructions "..."` | Custom prompt instructions | — |

## Voice Presets

| Preset | Host A | Host B | Style |
|--------|--------|--------|-------|
| `luna_and_sol` | af_heart (warm F) | af_sarah (clear F) | Two female hosts |
| `mixed_gender` | af_heart (warm F) | am_michael (M) | Mixed pair |
| `british_pair` | bf_emma (British F) | bm_george (British M) | British pair |
| `solo_warm` | af_heart (warm F) | — | Solo narrator |
| `solo_british` | bf_emma (British F) | — | Solo narrator |

## Project Structure

```
podify/
  app/                    Next.js app (pages + API routes)
    page.tsx              Main UI (form → progress → player)
    api/podcast/          REST API endpoints
  components/             React components
  lib/                    Shared pipeline logic (used by API + CLI)
    pipeline.ts           Core generateEpisode orchestrator
    generate-script.ts    LLM script generation
    generate-audio.ts     TTS audio synthesis
    assemble-podcast.ts   ffmpeg audio assembly
    jobs.ts               In-memory job queue
    types.ts              TypeScript types & constants
  cli/                    CLI entrypoint
  public/audio/           Static audio assets (intro/outro/ambient)
```

## API Reference

See [API.md](./API.md) for full endpoint documentation.

## License

Private
