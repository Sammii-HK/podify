# Podify API

Base URL: `http://localhost:3000` (development)

All endpoints use JSON. Generation is asynchronous — create a job, then poll for status.

---

## POST /api/podcast/generate

Start a new podcast generation job.

### Request

```json
{
  "content": "Your source text (min 50 chars)...",
  "title": "Episode Title",
  "format": "conversation",
  "duration": "5min",
  "tone": "educational",
  "voices": "luna_and_sol",
  "tts": "deepinfra",
  "llm": "openrouter",
  "includeMusic": false,
  "instructions": "Optional custom prompt instructions"
}
```

**Content source** — provide exactly one:

| Field | Type | Description |
|-------|------|-------------|
| `content` | string | Raw text (min 50 chars) |
| `url` | string | URL to fetch and extract text from |
| `grimoire_path` | string | Lunary grimoire path (e.g. `/grimoire/witch-types/kitchen-witch`) |

**Options** — all optional:

| Field | Type | Default | Values |
|-------|------|---------|--------|
| `title` | string | auto-generated | — |
| `format` | string | `"conversation"` | `conversation`, `interview`, `solo_narration`, `study_notes` |
| `duration` | string | `"5min"` | `5min`, `10min`, `15min` |
| `tone` | string | `"educational"` | `educational`, `casual`, `deep_dive`, `mystical` |
| `voices` | string | `"luna_and_sol"` | `luna_and_sol`, `mixed_gender`, `british_pair`, `solo_warm`, `solo_british` |
| `tts` | string | `"deepinfra"` | `deepinfra`, `inference`, `openai` |
| `llm` | string | `"openrouter"` | `openrouter`, `inference` |
| `includeMusic` | boolean | `false` | — |
| `instructions` | string | — | Custom prompt additions |

### Response

**200 OK**

```json
{
  "jobId": "bc9afd67-9d1c-4d04-95dc-c5714cc3b2dd"
}
```

**400 Bad Request**

```json
{ "error": "Provide content, url, or grimoire_path" }
{ "error": "Content too short (< 50 chars)" }
```

**429 Too Many Requests**

```json
{ "error": "Too many concurrent jobs. Try again shortly." }
```

Max 3 concurrent jobs.

---

## GET /api/podcast/status/:jobId

Poll for job progress. Call every 1 second until `status` is `complete` or `error`.

### Response

**200 OK** — Processing

```json
{
  "id": "bc9afd67-9d1c-4d04-95dc-c5714cc3b2dd",
  "status": "processing",
  "progress": 45,
  "stage": "audio",
  "message": "Generating audio clip 8/20"
}
```

**200 OK** — Complete

```json
{
  "id": "bc9afd67-9d1c-4d04-95dc-c5714cc3b2dd",
  "status": "complete",
  "progress": 100,
  "stage": "complete",
  "message": "Episode complete!",
  "result": {
    "transcript": [
      { "speaker": "HOST_A", "text": "Welcome to Cosmic Deep Dives..." },
      { "speaker": "HOST_B", "text": "Today we're talking about..." }
    ],
    "durationSeconds": 312,
    "wordCount": 1487,
    "costUsd": 0.0362
  }
}
```

**200 OK** — Error

```json
{
  "id": "bc9afd67-9d1c-4d04-95dc-c5714cc3b2dd",
  "status": "error",
  "progress": 5,
  "stage": "scripting",
  "message": "OPENROUTER_API_KEY not set",
  "error": "OPENROUTER_API_KEY not set"
}
```

**404 Not Found**

```json
{ "error": "Job not found" }
```

### Status values

| Status | Meaning |
|--------|---------|
| `pending` | Job created, not yet started |
| `processing` | Generation in progress |
| `complete` | Done — audio and transcript ready |
| `error` | Failed — check `error` field |

### Stage values

| Stage | Progress range | Description |
|-------|---------------|-------------|
| `scripting` | 0–30% | LLM generating dialogue script |
| `audio` | 30–80% | TTS converting script lines to audio clips |
| `assembly` | 80–95% | ffmpeg assembling clips into final MP3 |
| `complete` | 100% | Done |

---

## GET /api/podcast/:jobId/audio

Stream the generated MP3 file. Only available after job status is `complete`.

### Response

**200 OK**

- `Content-Type: audio/mpeg`
- Body: MP3 binary data

**404 Not Found**

```json
{ "error": "Audio not ready" }
{ "error": "Audio file not found on disk" }
```

---

## Example Flow

```bash
# 1. Start generation
JOB_ID=$(curl -s -X POST http://localhost:3000/api/podcast/generate \
  -H 'Content-Type: application/json' \
  -d '{"content":"Your content here (50+ chars)...", "duration":"5min"}' \
  | jq -r '.jobId')

# 2. Poll until complete
while true; do
  STATUS=$(curl -s http://localhost:3000/api/podcast/status/$JOB_ID)
  echo $STATUS | jq '{status, progress, message}'

  DONE=$(echo $STATUS | jq -r '.status')
  [ "$DONE" = "complete" ] || [ "$DONE" = "error" ] && break
  sleep 1
done

# 3. Download audio
curl -o podcast.mp3 http://localhost:3000/api/podcast/$JOB_ID/audio
```

---

---

## GET /api/podcast/feed

RSS 2.0 feed with iTunes namespace extensions. Compatible with Apple Podcasts, Spotify, Google Podcasts, Amazon Music, Pocket Casts, and Stitcher.

Submit this URL once to any podcast platform and new episodes auto-publish as they're generated.

### Response

- `Content-Type: application/rss+xml; charset=utf-8`
- `Cache-Control: public, max-age=300` (5 minutes)

### Configuration

Set `PODIFY_BASE_URL` environment variable to your public URL (defaults to `http://localhost:3456`).

Edit `.podify-output/feed.json` directly to customize show metadata (title, description, author, etc.).

---

## GET /api/podcast/episodes/:slug/audio

Permanent audio endpoint — serves episode MP3 by slug. Does not depend on job state (works forever as long as the file exists on disk).

### Parameters

| Param | Type | Description |
|-------|------|-------------|
| `slug` | string | Episode slug (e.g. `kitchen-witchcraft-101`) |

### Response

**200 OK**

- `Content-Type: audio/mpeg`
- `Cache-Control: public, max-age=31536000, immutable`
- Body: MP3 binary data

**404 Not Found**

```json
{ "error": "Episode not found" }
{ "error": "Audio file not found on disk" }
```

---

## Feed Manifest (`feed.json`)

Episodes are tracked in `.podify-output/feed.json`. This file is auto-updated when new episodes are generated.

To bootstrap existing episodes into the feed:

```bash
pnpm generate --rebuild-feed
```

### Format

```json
{
  "show": {
    "title": "Podify Podcast",
    "description": "AI-generated podcast episodes",
    "link": "https://example.com",
    "language": "en",
    "author": "Podify",
    "email": "podcast@example.com",
    "imageUrl": "",
    "category": "Education",
    "explicit": false
  },
  "episodes": [
    {
      "guid": "uuid",
      "slug": "kitchen-witchcraft-101",
      "dirName": "2026-02-14_kitchen-witchcraft-101",
      "title": "Kitchen Witchcraft 101",
      "description": "LLM-generated episode summary...",
      "pubDate": "2026-02-14T17:08:00.000Z",
      "durationSeconds": 312,
      "fileSizeBytes": 6078841,
      "audioFileName": "kitchen-witchcraft-101.mp3",
      "wordCount": 1487,
      "costUsd": 0.0362
    }
  ]
}
```

---

## Notes

- Jobs are stored in memory and expire after 1 hour
- Audio files are written to `.podify-output/` on disk and tracked in `feed.json`
- Permanent audio URLs via `/api/podcast/episodes/:slug/audio` survive job expiry
- RSS feed at `/api/podcast/feed` auto-updates as episodes are generated
- Max 3 concurrent generation jobs (returns 429 if exceeded)
- Generation typically takes 30–60 seconds for a 5-minute episode
- Set `PODIFY_BASE_URL` for production audio URLs in the RSS feed
