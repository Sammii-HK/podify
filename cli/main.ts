// ============================================================
// Podify CLI — Command-line entrypoint
// ============================================================
//
// Usage:
//   pnpm generate --url "https://lunary.app/grimoire/..." --duration 5min
//   pnpm generate --grimoire "/grimoire/witch-types/kitchen-witch" --duration 10min
//   pnpm generate --file "my-notes.txt" --format study_notes
//   pnpm generate --text "Your content here..." --title "My Episode"
//   pnpm generate --batch urls.txt
//
// ============================================================

import "dotenv/config";
import { readFile } from "fs/promises";
import {
  fetchGrimoirePage,
  readLocalFile,
  fetchUrl,
} from "../lib/fetch-content.js";
import { generateEpisode } from "../lib/pipeline.js";
import { rebuildFeedManifest } from "../lib/feed.js";
import {
  PodcastConfig,
  PodcastResult,
  VOICE_PRESETS,
} from "../lib/types.js";

// ============================================================
// CLI argument parsing
// ============================================================

function parseArgs(): Record<string, string> {
  const args: Record<string, string> = {};
  const argv = process.argv.slice(2);

  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const key = argv[i].slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : "true";
      args[key] = val;
      if (val !== "true") i++;
    }
  }

  return args;
}

// ============================================================
// Batch generation
// ============================================================

async function runBatch(listFile: string, baseConfig: Partial<PodcastConfig>) {
  const content = await readFile(listFile, "utf-8");
  const urls = content
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));

  console.log(`📋 Batch mode: ${urls.length} episodes to generate\n`);

  const results: { url: string; result?: PodcastResult; error?: string }[] = [];

  for (let i = 0; i < urls.length; i++) {
    console.log(`\n[${i + 1}/${urls.length}] ${urls[i]}`);

    try {
      const sourceContent = urls[i].startsWith("http")
        ? await fetchUrl(urls[i])
        : urls[i].startsWith("/grimoire")
          ? await fetchGrimoirePage(urls[i])
          : await readLocalFile(urls[i]);

      const title = urls[i]
        .split("/")
        .pop()
        ?.replace(/-/g, " ")
        ?.replace(/\.\w+$/, "") || `Episode ${i + 1}`;

      const config: PodcastConfig = {
        content: sourceContent,
        title,
        format: "conversation",
        duration: "5min",
        tone: "educational",
        voices: VOICE_PRESETS.luna_and_sol,
        ttsProvider: "deepinfra",
        llmProvider: "openrouter",
        includeMusic: false,
        ...baseConfig,
      };

      const outputDir = process.env.OUTPUT_DIR || ".podify-output";
      const result = await generateEpisode(config, outputDir);
      results.push({ url: urls[i], result });
    } catch (err) {
      console.error(`   ❌ Failed: ${(err as Error).message}`);
      results.push({ url: urls[i], error: (err as Error).message });
    }

    // Delay between episodes
    if (i < urls.length - 1) {
      console.log(`   ⏳ Waiting 2s before next episode...`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  // Summary
  const success = results.filter((r) => r.result).length;
  const failed = results.filter((r) => r.error).length;
  const totalCost = results.reduce((sum, r) => sum + (r.result?.costUsd || 0), 0);

  console.log(`\n${"=".repeat(60)}`);
  console.log(`📋 BATCH COMPLETE`);
  console.log(`${"=".repeat(60)}`);
  console.log(`   ✅ Success: ${success}/${urls.length}`);
  console.log(`   ❌ Failed: ${failed}/${urls.length}`);
  console.log(`   💰 Total cost: $${totalCost.toFixed(4)}`);
  console.log(`${"=".repeat(60)}\n`);
}

// ============================================================
// Main
// ============================================================

async function main() {
  const args = parseArgs();

  // Show help
  if (args.help || Object.keys(args).length === 0) {
    console.log(`
Podify — AI Podcast Generator
===============================

Usage:
  pnpm generate [options]

Content source (pick one):
  --grimoire PATH    Lunary grimoire path (e.g. /grimoire/witch-types/kitchen-witch)
  --url URL          Any web URL to convert
  --file PATH        Local file to convert
  --text "..."       Raw text content
  --batch FILE       File with list of URLs/paths (one per line)

Options:
  --title "..."      Episode title (auto-generated if omitted)
  --format TYPE      conversation | interview | solo_narration | study_notes (default: conversation)
  --duration DUR     5min | 10min | 15min (default: 5min)
  --tone TONE        educational | casual | deep_dive | mystical (default: educational)
  --voices PRESET    luna_and_sol | mixed_gender | british_pair | solo_warm (default: luna_and_sol)
  --tts PROVIDER     deepinfra | inference | openai (default: deepinfra)
  --llm PROVIDER     openrouter | inference (default: openrouter)
  --music            Include background music (default: off)
  --instructions "..." Custom instructions for script generation
  --rebuild-feed     Rebuild feed.json from disk (uploads to Vercel Blob if BLOB_READ_WRITE_TOKEN is set)

Examples:
  pnpm generate --grimoire "/grimoire/witch-types/kitchen-witch" --duration 5min
  pnpm generate --file notes.txt --format study_notes --duration 10min
  pnpm generate --batch grimoire-urls.txt --tone mystical
  pnpm generate --rebuild-feed
    `);
    process.exit(0);
  }

  // Rebuild feed manifest
  if (args["rebuild-feed"]) {
    const outputDir = process.env.OUTPUT_DIR || ".podify-output";
    console.log(`\n📡 Rebuilding feed manifest from ${outputDir}/...\n`);
    await rebuildFeedManifest(outputDir);
    process.exit(0);
  }

  // Batch mode
  if (args.batch) {
    const voicePreset =
      VOICE_PRESETS[args.voices as keyof typeof VOICE_PRESETS] ||
      VOICE_PRESETS.luna_and_sol;

    await runBatch(args.batch, {
      format: (args.format as any) || "conversation",
      duration: (args.duration as any) || "5min",
      tone: (args.tone as any) || "educational",
      voices: voicePreset,
      ttsProvider: (args.tts as any) || "deepinfra",
      llmProvider: (args.llm as any) || "openrouter",
      includeMusic: args.music === "true",
      customInstructions: args.instructions,
    });
    return;
  }

  // Single episode mode — get content
  let content: string;
  let title = args.title || "";

  if (args.grimoire) {
    content = await fetchGrimoirePage(args.grimoire);
    if (!title) {
      title = args.grimoire.split("/").pop()?.replace(/-/g, " ") || "Untitled";
    }
  } else if (args.url) {
    content = await fetchUrl(args.url);
    if (!title) {
      title = args.url.split("/").pop()?.replace(/-/g, " ") || "Untitled";
    }
  } else if (args.file) {
    content = await readLocalFile(args.file);
    if (!title) {
      title = args.file.split("/").pop()?.replace(/\.\w+$/, "")?.replace(/-/g, " ") || "Untitled";
    }
  } else if (args.text) {
    content = args.text;
    if (!title) title = "Episode";
  } else {
    console.error("❌ No content source provided. Use --grimoire, --url, --file, or --text");
    console.error("   Run with --help for usage info");
    process.exit(1);
  }

  if (content.length < 50) {
    console.error("❌ Content too short (< 50 chars). Check your source.");
    process.exit(1);
  }

  // Build config
  const voicePreset =
    VOICE_PRESETS[args.voices as keyof typeof VOICE_PRESETS] ||
    VOICE_PRESETS.luna_and_sol;

  const config: PodcastConfig = {
    content,
    title,
    format: (args.format as any) || "conversation",
    duration: (args.duration as any) || "5min",
    tone: (args.tone as any) || "educational",
    voices: voicePreset,
    ttsProvider: (args.tts as any) || "deepinfra",
    llmProvider: (args.llm as any) || "openrouter",
    includeMusic: args.music === "true",
    customInstructions: args.instructions,
  };

  const outputDir = process.env.OUTPUT_DIR || ".podify-output";
  await generateEpisode(config, outputDir);
}

main().catch((err) => {
  console.error(`\n❌ Fatal error: ${err.message}`);
  process.exit(1);
});
