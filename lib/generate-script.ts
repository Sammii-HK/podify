// ============================================================
// Stage 1: Script Generation
// Converts source content into a two-host podcast script
// ============================================================

import { ScriptLine, PodcastConfig, DURATION_WORDS } from "@/lib/types";

export type ProgressCallback = (message: string, percent: number) => void;

// ============================================================
// System prompts per format
// ============================================================

function getSystemPrompt(config: PodcastConfig): string {
  const wordTarget = DURATION_WORDS[config.duration] || 750;
  const hostA = config.voices.host_a.name;
  const hostB = config.voices.host_b?.name || "Guest";

  const baseRules = `
RULES:
- Write for SPOKEN word — use contractions, casual phrasing, natural rhythm
- Include "um", "right", "exactly", "oh interesting" SPARINGLY (max 3-4 per episode)
- Never say "great question" — react naturally instead
- Each speaker turn: 1-4 sentences MAX. Keep it punchy.
- Include [laughs], [pause] stage directions VERY sparingly (max 2-3 per episode)
- Target: ${wordTarget} words total
- Source content is your ONLY reference — don't make up facts
- End with a soft CTA: mention Lunary's grimoire or birth chart tool naturally

OUTPUT: Return ONLY a JSON array, no markdown, no explanation:
[{"speaker":"HOST_A","text":"..."},{"speaker":"HOST_B","text":"..."},...]
`.trim();

  const toneInstructions: Record<string, string> = {
    educational:
      "Tone: Clear, informative, accessible. Explain jargon when used. Use relatable analogies.",
    casual:
      "Tone: Relaxed, like two friends chatting over coffee. Light humour welcome. Keep it breezy.",
    deep_dive:
      "Tone: Thorough and detailed. Go deeper into nuance. It's okay to spend time on complex ideas.",
    mystical:
      "Tone: Reverent but not pretentious. Honour the spiritual dimension while staying grounded and practical.",
  };

  const formats: Record<string, string> = {
    conversation: `
You are a podcast script writer for "The Grimoire" — a two-host show about astrology, witchcraft, and spiritual practice, produced by Lunary.

${hostA} (HOST_A) — The knowledgeable guide. Warm, clear, explains concepts accessibly. Uses metaphors and real-world connections. Never condescending.

${hostB} (HOST_B) — The curious explorer. Asks the questions listeners are thinking. Gets genuinely excited about discoveries. Pushes for practical takeaways.

Name usage:
- Hosts may occasionally use each other's names, but keep it natural — don't force it
- Once or twice per episode is plenty, only when it feels organic

STRUCTURE:
1. Intro (15-20s) — ${hostA} welcomes listeners: "Hey! I'm ${hostA}..." / "And I'm ${hostB}, and this is The Grimoire by Lunary." Brief, warm, natural — not robotic. Only do this intro once at the start.
2. Hook (20s) — Tease today's topic in an intriguing way
3. Context (1min) — Set the scene, why this matters
4. Deep exploration (3-7min) — Core content, back and forth
5. Practical Takeaway (1min) — What can listeners actually DO
6. Outro (30s) — Wrap up with soft CTA

${toneInstructions[config.tone] || toneInstructions.educational}

${baseRules}`,

    interview: `
You are a podcast script writer. ${hostA} (HOST_A) is the interviewer, ${hostB} (HOST_B) is the expert guest.

The interviewer asks probing questions. The expert gives detailed, engaging answers with examples and stories. The interviewer occasionally summarises or reacts.

STRUCTURE:
1. Introduction of guest and topic (30s)
2. "How did you get into this?" or origin story (1min)
3. Core Q&A — 3-5 questions going progressively deeper
4. Rapid-fire or "one thing listeners should know" (1min)
5. Where to learn more + outro (30s)

${toneInstructions[config.tone] || toneInstructions.educational}

${baseRules}`,

    solo_narration: `
You are a podcast script writer for a single-narrator show. ${hostA} (HOST_A) narrates everything.

Write as a flowing narrative — like an audiobook or documentary voiceover. Use rhetorical questions to engage the listener. Vary sentence length for rhythm.

STRUCTURE:
1. Hook — compelling opening line or question
2. Background — set the scene
3. Core content — walk through the material
4. Reflection — why this matters
5. Closing thought + soft CTA

${toneInstructions[config.tone] || toneInstructions.educational}

OUTPUT: Return ONLY a JSON array with all entries as HOST_A:
[{"speaker":"HOST_A","text":"..."},{"speaker":"HOST_A","text":"..."},...]

Target: ${wordTarget} words total.`,

    study_notes: `
You are a podcast script writer that turns study notes into an engaging two-person discussion.

${hostA} (HOST_A) — The teacher. Explains concepts clearly, uses examples, checks understanding.
${hostB} (HOST_B) — The student. Asks clarifying questions, makes connections, occasionally gets confused (then corrected).

KEY: Make it feel like a productive tutoring session, not a lecture. ${hostB} should make mistakes or have misconceptions that ${hostA} gently corrects — this helps the listener learn.

STRUCTURE:
1. "Today we're covering..." overview (30s)
2. Concept-by-concept walkthrough with Q&A
3. Quick recap / "test yourself" moment
4. Key takeaways to remember

${toneInstructions[config.tone] || toneInstructions.educational}

${baseRules}`,

    deep_review: `
You are a podcast script writer that turns study material into a natural, engaging two-host discussion — like two people who've both read the material and are breaking it down together over coffee.

${hostA} (HOST_A) — Energetic and sharp. Synthesises concepts, makes killer analogies, and gets visibly excited when connecting dots. Occasionally plays devil's advocate just to test ideas.
${hostB} (HOST_B) — Curious and reactive. Makes surprising connections, asks "but wait..." questions, and isn't afraid to admit when something's confusing. Gets genuinely pumped when a concept clicks.

BOTH hosts are equals — neither is the teacher. They're two knowledgeable people having a real conversation. They interrupt each other (briefly), build on points, occasionally disagree, and have genuine "aha" moments.

ENERGY & EXPRESSION:
- This should feel ALIVE, not like a lecture. Hosts should react emotionally to interesting concepts.
- Use emotion cues in the text naturally: <laugh> when something is genuinely funny or ironic, <chuckle> for lighter moments, <sigh> when something is frustrating or complex.
- Don't overdo emotion cues — max 8-10 across the whole episode. They should feel earned, not forced.
- Vary energy levels: excited discovery, quiet "hmm that's interesting" moments, playful challenging.
- Use emphasis words: "THIS is the key thing", "that's actually wild", "OK OK OK so..."

KEY BEHAVIOURS:
- Riff off each other: "Oh that reminds me of..." / "Right, and the interesting bit is..."
- Flag what matters: "This is the one you really need to remember" / "I keep getting this confused with..."
- Use analogies and real-world connections to make concepts stick
- Quiz each other: "OK quick, what's the difference between X and Y?" / "Hmm... is it..."
- Be honest about difficulty: "OK this part took me ages to get" / "Yeah I messed this up in an interview once"
- React genuinely: "Wait, seriously?" / "Oh THAT'S why!" / "No way, I always thought..."
- Disagree sometimes: "I actually think of it differently..." / "See I'm not sure about that..."

CRITICAL FOR NATURAL SPEECH:
- Keep each turn SHORT — 1-2 sentences max. This is vital for natural-sounding audio.
- Vary sentence length dramatically. Mix "Wait, what?" with slightly longer explanations.
- Write how people actually talk — fragments, false starts, self-corrections. "So basically... actually no, let me put it this way."
- Avoid long monologues. If a concept needs 4+ sentences, the other host MUST jump in.
- Use conversational fillers sparingly but naturally: "like", "right", "I mean", "you know what I mean"

STRUCTURE:
1. Quick intro — what we're covering and why it matters. Start with energy: "OK so today we're tackling..." (20s)
2. Walk through key concepts — discuss each one like you're both discovering it. React to each other.
3. "The tricky bits" — flag confusions, common mistakes, "I always mix up X and Y"
4. Rapid-fire connections — how these ideas link together, real-world applications
5. Challenge round — quiz each other on the must-know points (30s)
6. Quick outro — "alright, key takeaways..." (20s)

${toneInstructions[config.tone] || toneInstructions.casual}

${baseRules}`,
  };

  let prompt = formats[config.format] || formats.conversation;

  if (config.customInstructions) {
    prompt += `\n\nADDITIONAL INSTRUCTIONS: ${config.customInstructions}`;
  }

  return prompt;
}

// ============================================================
// LLM API calls
// ============================================================

async function callBrandApi(
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const brandApiUrl = process.env.BRAND_API_URL ?? "http://localhost:9002";

  const res = await fetch(`${brandApiUrl}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "sammii-brand",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 16384,
      temperature: 0.8,
    }),
  });

  if (!res.ok) {
    throw new Error(`Brand API error ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  return data.choices[0].message.content;
}

async function callOpenRouter(
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not set");

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://lunary.app",
      "X-Title": "Lunary Podcast Generator",
    },
    body: JSON.stringify({
      model: "anthropic/claude-sonnet-4",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 16384,
      temperature: 0.8, // Slightly creative for natural dialogue
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenRouter error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.choices[0].message.content;
}

async function callInference(
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const apiKey = process.env.INFERENCE_API_KEY;
  if (!apiKey) throw new Error("INFERENCE_API_KEY not set");

  const res = await fetch("https://api.inference.sh/v1/run", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      app: "openrouter/claude-sonnet-45",
      input: {
        system: systemPrompt,
        prompt: userPrompt,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`inference.sh error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.output?.text || data.output;
}

// ============================================================
// Parse LLM response into structured script
// ============================================================

function parseScript(raw: string): ScriptLine[] {
  // Strip markdown code fences if present
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  try {
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) {
      throw new Error("Expected JSON array");
    }

    return parsed.map((line: any, i: number) => {
      if (!line.speaker || !line.text) {
        throw new Error(`Line ${i} missing speaker or text`);
      }
      return {
        speaker: line.speaker as "HOST_A" | "HOST_B",
        text: cleanTextForTTS(line.text),
      };
    });
  } catch (e) {
    console.error("Failed to parse script JSON. Raw output:");
    console.error(cleaned.slice(0, 500));
    throw new Error(`Script parsing failed: ${(e as Error).message}`);
  }
}

/**
 * Clean text for TTS consumption:
 * - Remove stage directions like [laughs] (TTS can't handle them)
 * - Clean up excessive punctuation
 * - Ensure proper sentence endings
 */
function cleanTextForTTS(text: string): string {
  return (
    text
      // Remove stage directions — TTS will just read them literally
      .replace(/\[laughs?\]/gi, "")
      .replace(/\[pause\]/gi, "...")
      .replace(/\[emphasis\]/gi, "")
      .replace(/\[.*?\]/g, "")
      // Clean up whitespace
      .replace(/\s+/g, " ")
      .trim()
  );
}

// ============================================================
// Episode description generation (for RSS feed)
// ============================================================

export async function generateEpisodeDescription(
  title: string,
  transcript: ScriptLine[],
  llmProvider: "openrouter" | "inference"
): Promise<string> {
  const condensed = transcript
    .map((l) => l.text)
    .join(" ")
    .slice(0, 2000);
  const prompt = `Write a 2-3 sentence podcast episode description for an episode titled "${title}".
This is for an RSS feed listing — make it compelling and informative, not clickbait.
Based on this transcript excerpt:\n\n${condensed}`;
  const system =
    "You write concise podcast episode descriptions. Return ONLY the description text, no quotes or labels.";

  const raw =
    llmProvider === "openrouter"
      ? await callOpenRouter(system, prompt)
      : await callInference(system, prompt);
  return raw.trim();
}

// ============================================================
// Main export
// ============================================================

export async function generateScript(
  config: PodcastConfig,
  onProgress?: ProgressCallback
): Promise<ScriptLine[]> {
  const systemPrompt = getSystemPrompt(config);
  const wordTarget = DURATION_WORDS[config.duration] || 750;

  const userPrompt = `Create a ${config.duration} podcast episode titled "${config.title}" based on the following content.

Target approximately ${wordTarget} words of dialogue.

<source_content>
${config.content}
</source_content>`;

  const msg = `Generating script (${config.format}, ${config.duration}, ${config.tone})...`;
  console.log(`🎙️  ${msg}`);
  console.log(`   LLM provider: ${config.llmProvider}`);
  onProgress?.(msg, 5);

  let raw: string;
  if (config.llmProvider === "openrouter") {
    try {
      raw = await callOpenRouter(systemPrompt, userPrompt);
    } catch (err) {
      console.warn(`   OpenRouter failed, trying Brand API: ${(err as Error).message}`);
      raw = await callBrandApi(systemPrompt, userPrompt);
    }
  } else if (config.llmProvider === "inference") {
    try {
      raw = await callInference(systemPrompt, userPrompt);
    } catch (err) {
      console.warn(`   Inference.sh failed, trying Brand API: ${(err as Error).message}`);
      raw = await callBrandApi(systemPrompt, userPrompt);
    }
  } else {
    // Brand API direct (free, local, lower quality)
    raw = await callBrandApi(systemPrompt, userPrompt);
  }

  onProgress?.("Parsing script...", 25);

  const script = parseScript(raw);
  const wordCount = script.reduce(
    (sum, line) => sum + line.text.split(/\s+/).length,
    0
  );

  console.log(`   ✅ Script generated: ${script.length} lines, ${wordCount} words`);
  onProgress?.(`Script generated: ${script.length} lines, ${wordCount} words`, 30);

  return script;
}
