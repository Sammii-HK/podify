# Lunary Podcast Pipeline — Architecture & Sample Episode

## Overview

A NotebookLM-style podcast generator that converts Lunary grimoire content (or any text input) into natural two-host conversational audio. Two use cases:

1. **Lunary Content Marketing** — Weekly "Cosmic Deep Dive" episodes from grimoire articles
2. **Personal Study Tool** — Convert any notes/documents into podcast-format audio

---

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐     ┌──────────────┐
│ Source       │────▶│ Script       │────▶│ TTS         │────▶│ Audio        │
│ Content      │     │ Generator    │     │ Generation  │     │ Assembly     │
│              │     │ (LLM)        │     │ (Kokoro)    │     │ (ffmpeg)     │
└─────────────┘     └──────────────┘     └─────────────┘     └──────────────┘
  Grimoire page       Claude/Sonnet       Per-speaker          Merge clips +
  Study notes          via OpenRouter      voice clips          background music
  Any text input       or inference.sh                          + intro/outro
```

### Stage 1: Script Generation

**Input:** Raw text content (grimoire article, study notes, etc.)
**Output:** Structured JSON script with speaker-labeled dialogue

**System Prompt (this is the secret sauce):**

```
You are a podcast script writer for a two-host educational show.

HOST_A (Luna) — The knowledgeable guide. Warm, clear, explains concepts
accessibly. Uses metaphors. Never condescending.

HOST_B (Sol) — The curious explorer. Asks the questions listeners are
thinking. Gets genuinely excited about discoveries. Pushes for practical
takeaways.

RULES:
- Write for spoken word — use contractions, casual phrasing, natural pauses
- Include "um", "right", "exactly", "oh that's interesting" sparingly for realism
- Never say "great question" — instead react naturally
- Each speaker turn should be 1-4 sentences max
- Include [laughs], [pause], [emphasis] stage directions sparingly
- Structure: Hook (30s) → Context (1min) → Deep Dive (3-5min) → Practical Takeaway (1min) → Outro (30s)
- Target word count: 750 words per 5 minutes of audio
- Always end with a soft CTA: "If you want to explore this in your own chart..."

OUTPUT FORMAT:
Return a JSON array of objects:
[
  {"speaker": "HOST_A", "text": "..."},
  {"speaker": "HOST_B", "text": "..."},
  ...
]
```

**API Call:**

```bash
infsh app run openrouter/claude-sonnet-45 --input '{
  "system": "<system prompt above>",
  "prompt": "Create a 5-minute podcast episode about the following content:\n\n<content>\n'"$(cat grimoire-article.txt)"'\n</content>\n\nMake it engaging and accessible for someone new to astrology."
}'
```

**Cost:** ~$0.01-0.05 per episode (depending on input length)

### Stage 2: TTS Generation

**Input:** JSON script from Stage 1
**Output:** Individual audio clips per speaker turn

```bash
# For each line in the script:
# HOST_A → voice "am_michael" (or "af_heart" for female host)
# HOST_B → voice "af_sarah" (or "am_adam" for male host)

# Via inference.sh:
infsh app run infsh/kokoro-tts --input '{
  "text": "Speaker line here...",
  "voice": "af_heart"
}' > clip_001.json

# Via DeepInfra API directly:
curl -X POST https://api.deepinfra.com/v1/inference/hexgrad/Kokoro-82M \
  -H "Authorization: bearer $DEEPINFRA_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text": "Speaker line here...", "voice": "af_heart"}' \
  > clip_001.json
```

**Available Kokoro Voices:**
| Voice ID | Gender | Style |
|----------|--------|-------|
| af_heart | Female | Warm, default |
| af_sarah | Female | Clear, professional |
| af_bella | Female | Soft, intimate |
| am_michael | Male | Conversational |
| am_adam | Male | Deep, authoritative |
| bf_emma | Female | British |
| bm_george | Male | British |

**Recommended for Lunary podcast:**

- Luna (HOST_A): `af_heart` — warm, knowledgeable guide
- Sol (HOST_B): `af_sarah` — clear, curious explorer
- Or mix genders: `af_heart` + `am_michael`

**Cost:** ~$0.006 per 10-min episode (DeepInfra) or FREE if self-hosted

### Stage 3: Audio Assembly

**Input:** Individual audio clips + optional background music
**Output:** Final podcast MP3

```bash
# Option A: Using inference.sh media-merger
infsh app run infsh/media-merger --input '{
  "audio_files": ["clip_001_url", "clip_002_url", ...],
  "background_audio": "ambient_music_url",
  "background_volume": 0.12
}'

# Option B: Using ffmpeg locally (more control)
# 1. Concatenate speaker clips with short pauses between
ffmpeg -f concat -i clips.txt -c:a libmp3lame -q:a 2 dialogue.mp3

# 2. Generate or use pre-made background music
infsh app run infsh/ai-music --input '{
  "prompt": "Soft ambient cosmic background music, subtle synth pads, dreamy, loopable, podcast background"
}'

# 3. Mix dialogue over background
ffmpeg -i dialogue.mp3 -i background.mp3 \
  -filter_complex "[1:a]volume=0.12[bg];[0:a][bg]amix=inputs=2:duration=first" \
  -c:a libmp3lame -q:a 2 final_episode.mp3
```

---

## Cost Summary Per Episode

| Component         | Provider                     | Cost (10-min episode)  |
| ----------------- | ---------------------------- | ---------------------- |
| Script generation | Claude Sonnet via OpenRouter | ~$0.03                 |
| TTS (Kokoro)      | DeepInfra                    | ~$0.006                |
| TTS (Kokoro)      | Self-hosted                  | $0.00                  |
| Background music  | inference.sh (one-time)      | ~$0.05                 |
| Audio merge       | ffmpeg (local)               | $0.00                  |
| **Total**         |                              | **~$0.04 per episode** |

Compare: OpenAI TTS-1 would be ~$0.15 for TTS alone.

---

## API Design (If Building as a Service)

```typescript
// POST /api/podcast/generate
interface PodcastRequest {
  // Content input (provide one)
  content?: string; // Raw text
  url?: string; // URL to fetch content from
  grimoire_path?: string; // Lunary grimoire path e.g. "/witch-types/cosmic-witch"

  // Configuration
  format: "conversation" | "interview" | "solo_narration";
  duration_target: "5min" | "10min" | "15min";
  tone: "educational" | "casual" | "deep_dive" | "mystical";

  // Voice configuration
  voices: {
    host_a: { id: string; name: string }; // e.g. { id: "af_heart", name: "Luna" }
    host_b: { id: string; name: string }; // e.g. { id: "af_sarah", name: "Sol" }
  };

  // Optional
  include_background_music: boolean;
  include_intro_outro: boolean;
  custom_instructions?: string; // e.g. "Focus on practical spellwork"
}

interface PodcastResponse {
  audio_url: string;
  transcript: PodcastLine[];
  duration_seconds: number;
  word_count: number;
  cost_usd: number;
}

interface PodcastLine {
  speaker: string;
  text: string;
  start_time: number;
  end_time: number;
}
```

### Next.js API Route (Simplified)

```typescript
// app/api/podcast/generate/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json();

  // Step 1: Get source content
  let content = body.content;
  if (body.grimoire_path) {
    content = await fetchGrimoireContent(body.grimoire_path);
  }

  // Step 2: Generate script via LLM
  const script = await generateScript(content, {
    format: body.format,
    duration: body.duration_target,
    tone: body.tone,
    voices: body.voices,
  });

  // Step 3: Generate audio for each line
  const audioClips = await Promise.all(
    script.map(async (line, i) => {
      const voiceId =
        line.speaker === "HOST_A"
          ? body.voices.host_a.id
          : body.voices.host_b.id;

      return generateTTS(line.text, voiceId);
    }),
  );

  // Step 4: Assemble final audio
  const finalAudio = await assembleAudio(audioClips, {
    includeMusic: body.include_background_music,
    includeIntroOutro: body.include_intro_outro,
  });

  return NextResponse.json({
    audio_url: finalAudio.url,
    transcript: script,
    duration_seconds: finalAudio.duration,
    cost_usd: calculateCost(content.length, script.length),
  });
}

async function generateTTS(text: string, voice: string) {
  // Option A: inference.sh
  const res = await fetch("https://api.inference.sh/v1/run", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.INFERENCE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      app: "infsh/kokoro-tts",
      input: { text, voice },
    }),
  });
  return res.json();

  // Option B: DeepInfra direct
  // const res = await fetch("https://api.deepinfra.com/v1/inference/hexgrad/Kokoro-82M", {
  //   method: "POST",
  //   headers: {
  //     "Authorization": `Bearer ${process.env.DEEPINFRA_TOKEN}`,
  //     "Content-Type": "application/json",
  //   },
  //   body: JSON.stringify({ text, voice }),
  // });
  // return res.json();
}
```

---

## Sample Episode Script: "What Is a Kitchen Witch?"

Based on your grimoire page which has 709 impressions and is climbing fast.

```json
[
  {
    "speaker": "HOST_A",
    "text": "So today we're diving into something that honestly surprised me when I first learned about it — kitchen witchcraft. And I think a lot of people hear 'witch' and immediately picture, you know, cauldrons and dark forests."
  },
  {
    "speaker": "HOST_B",
    "text": "Right, the whole pointy hat, broomstick thing. But kitchen witchcraft is actually... really grounded? Like, literally about your kitchen."
  },
  {
    "speaker": "HOST_A",
    "text": "Exactly. A kitchen witch is someone who channels their magical practice through cooking, herbs, and the home. The idea is that everyday acts — stirring a pot, choosing your ingredients, even how you set your table — can be intentional, ritualistic."
  },
  {
    "speaker": "HOST_B",
    "text": "Okay so when my grandmother used to say she was putting love into her cooking... she was basically doing kitchen witchcraft?"
  },
  {
    "speaker": "HOST_A",
    "text": "[laughs] In a way, yes! That's actually one of the most beautiful things about this practice. It connects to traditions that go back centuries — the hearth as the spiritual centre of the home. In many cultures, the person who tended the fire and prepared food was seen as the keeper of the family's wellbeing."
  },
  {
    "speaker": "HOST_B",
    "text": "That's fascinating. So what does a kitchen witch actually do differently from, say, someone who just likes to cook?"
  },
  {
    "speaker": "HOST_A",
    "text": "Great distinction. The key difference is intention. A kitchen witch might stir clockwise to draw positive energy in, or counter-clockwise to banish negativity. They'll choose herbs not just for flavour but for their magical correspondences — rosemary for protection, cinnamon for prosperity, lavender for peace."
  },
  {
    "speaker": "HOST_B",
    "text": "Oh, so the herb garden isn't just a herb garden."
  },
  {
    "speaker": "HOST_A",
    "text": "Not at all. Every herb has a dual purpose. Basil? That's for wealth and love. Thyme is for courage. And the timing matters too — some kitchen witches align their cooking with moon phases. Baking bread on a full moon, for instance, is about abundance."
  },
  {
    "speaker": "HOST_B",
    "text": "This is making me rethink my entire meal prep routine. [laughs] But seriously, how does someone actually start? Like if someone's listening to this thinking 'I want to try this' — what's step one?"
  },
  {
    "speaker": "HOST_A",
    "text": "Honestly? Start with what you already do. Next time you're cooking, just pause before you begin. Set an intention — maybe it's 'I'm cooking this meal to bring calm to my household.' Stir with purpose. Choose your spices consciously. That's it. You don't need special tools or a grimoire to begin."
  },
  {
    "speaker": "HOST_B",
    "text": "Though having a grimoire doesn't hurt."
  },
  {
    "speaker": "HOST_A",
    "text": "[laughs] No, it definitely doesn't. And that's actually where something like Lunary comes in — the grimoire section has detailed correspondences for dozens of herbs, crystals, even candle colours. So if you want to know which herb to add to your soup for protection, or what spice brings luck... it's all there."
  },
  {
    "speaker": "HOST_B",
    "text": "What I love about this is how accessible it is. You don't need to buy anything special. You literally just need your kitchen."
  },
  {
    "speaker": "HOST_A",
    "text": "That's exactly why kitchen witchcraft is one of the fastest-growing paths right now. It fits into modern life. You're already cooking — you're just adding a layer of mindfulness and intention to it. Some people keep a kitchen altar, even if it's just a small shelf with a candle and a favourite crystal."
  },
  {
    "speaker": "HOST_B",
    "text": "And there are no rules about how elaborate it needs to be?"
  },
  {
    "speaker": "HOST_A",
    "text": "None at all. That's one of the biggest misconceptions — that you need to follow rigid rituals. Kitchen witchcraft is deeply personal. Your practice is your practice. Some people write sigils on their cutting boards, others just whisper their intentions while they stir. Both are valid."
  },
  {
    "speaker": "HOST_B",
    "text": "I think that's going to resonate with a lot of people. Okay so if someone wants to go deeper — beyond just setting intentions while cooking — where do they go?"
  },
  {
    "speaker": "HOST_A",
    "text": "I'd say start learning your herb correspondences — what each one means magically. Then explore moon phase cooking. And if you're curious about how kitchen witchcraft connects to your own astrological chart — like which herbs align with your birth chart placements — that's where things get really interesting. You can explore all of that for free on Lunary."
  },
  {
    "speaker": "HOST_B",
    "text": "Love it. Alright, so to sum up — kitchen witchcraft: it's real, it's ancient, it's accessible, and your spice rack might already be a magical toolkit. Check out Lunary's grimoire if you want to dive deeper. Until next time!"
  },
  {
    "speaker": "HOST_A",
    "text": "Happy cooking, and happy casting."
  }
]
```

**Word count:** ~750 words → approximately 5 minutes of audio
**Estimated cost to produce:** £0.04

---

## Content Strategy: What to Turn Into Podcasts

Based on your GSC data, prioritise these grimoire topics:

### High Impression / High Growth (produce first)

| Topic              | Impressions      | Why It Works as Audio                    |
| ------------------ | ---------------- | ---------------------------------------- |
| Kitchen Witch      | 709 (↑ from 37!) | Practical, relatable, evergreen          |
| Cosmic Witch       | 227              | Mystical, ties directly to astrology app |
| Mercury Retrograde | 521              | Timely, everyone talks about it          |
| Transits Overview  | 1,209            | Educational, drives app signups          |
| 10th House         | 320              | Career-focused, broad appeal             |
| Green Witch        | 308 (↑ from 56)  | Nature-focused, growing interest         |
| Sea Witch          | 38 (7.89% CTR!)  | Niche but high engagement                |

### Suggested Episode Calendar

| Week | Episode                                         | Source Content                       |
| ---- | ----------------------------------------------- | ------------------------------------ |
| 1    | "What Is a Kitchen Witch?"                      | /grimoire/witch-types/kitchen-witch  |
| 2    | "Mercury Retrograde: What's Actually Happening" | /grimoire/retrogrades/mercury        |
| 3    | "Reading Your Birth Chart Transits"             | /grimoire/transits                   |
| 4    | "Candle Magic 101: What the Colours Mean"       | /grimoire/candle-magic/colors        |
| 5    | "The Cosmic Witch Path"                         | /grimoire/witch-types/cosmic-witch   |
| 6    | "Your 10th House: Career in Your Chart"         | /grimoire/houses/tenth               |
| 7    | "Green Witchcraft for Beginners"                | /grimoire/witch-types/green-witch    |
| 8    | "Moon Water: How to Make It & Use It"           | /grimoire/spells/moon-water-charging |

### Distribution

- Embed audio player on each grimoire page (increases time-on-page, SEO boost)
- Upload to Spotify/Apple Podcasts as "Lunary: Cosmic Deep Dives"
- Extract 60-second clips for TikTok/Reels (pairs with your existing video pipeline)
- Offer as a feature: "Listen to this article" button on grimoire pages

---

## Implementation Plan for Claude Code

```
lunary-podcast/
├── src/
│   ├── generate-script.ts    # LLM call to create dialogue
│   ├── generate-audio.ts     # Kokoro TTS per speaker line
│   ├── assemble-podcast.ts   # ffmpeg merge + background music
│   ├── pipeline.ts           # Orchestrates all 3 stages
│   └── api-route.ts          # Next.js API endpoint
├── prompts/
│   ├── conversation.txt      # Two-host format (default)
│   ├── interview.txt         # One host interviews expert
│   ├── solo-narration.txt    # Single narrator
│   └── study-notes.txt       # Optimised for learning material
├── audio/
│   ├── intro.mp3             # Pre-made Lunary intro jingle
│   ├── outro.mp3             # Pre-made outro
│   └── ambient-cosmic.mp3    # Background music (generate once)
├── scripts/
│   ├── batch-generate.sh     # Generate week's episodes
│   └── publish.sh            # Upload to hosting + update site
└── package.json
```

### Quick Start Commands

```bash
# Generate single episode from grimoire URL
npx tsx src/pipeline.ts --url "https://lunary.app/grimoire/modern-witchcraft/witch-types/kitchen-witch" --duration 5min

# Batch generate from list of URLs
npx tsx src/pipeline.ts --batch urls.txt --duration 5min

# Generate from personal study notes
npx tsx src/pipeline.ts --file "my-notes.txt" --format study --duration 10min
```
