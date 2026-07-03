// ============================================================
// One-off content-ops script: upload + tag the Starter Content
// Library episodes into the live feed.json manifest.
//
// Usage: npx tsx scripts/tag-starter-library.ts [--dry-run]
//
// Only touches Blob-backed manifest storage (readManifestFromStore /
// writeManifestToStore from lib/storage.ts) — same path the app itself
// uses. Safe to re-run: skips episodes whose slug is already present.
// ============================================================

import { readFile, stat } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";
import dotenv from "dotenv";
dotenv.config({ path: join(process.cwd(), ".env.local") });
import { readManifestFromStore, writeManifestToStore, uploadEpisodeAudio } from "../lib/storage";
import { getAudioDuration } from "../lib/feed";
import { EpisodeMeta } from "../lib/types";

const OUTPUT_DIR = join(process.cwd(), ".podify-output");
const DRY_RUN = process.argv.includes("--dry-run");

interface Selection {
  dirName: string;
  mp3File: string;
  title: string;
  description: string;
  category: string;
  packId: string;
}

// ------------------------------------------------------------
// Curated selection: real Orpheus-voiced episodes only, grouped
// into 4 topic packs. Titles are human-readable renamings of the
// real content (verified against transcript.txt), not placeholders.
// ------------------------------------------------------------
const SELECTIONS: Selection[] = [
  // ---- Pack: Technical Interview Skills (10 episodes) ----
  {
    dirName: "2026-03-09_1-core-technical-recall-4c62f6",
    mp3File: "1-core-technical-recall-4c62f6.mp3",
    title: "Core Technical Recall: React & JavaScript Fundamentals",
    description:
      "Jess and Zac drill the React and JavaScript fundamentals that come up cold in every frontend interview — the greatest hits you need to have automatic.",
    category: "Technical Interview Skills",
    packId: "interview-skills",
  },
  {
    dirName: "2026-03-09_1-core-technical-recall-95b814",
    mp3File: "1-core-technical-recall-95b814.mp3",
    title: "Core Technical Recall: Concepts That Connect",
    description:
      "A second pass at core technical concepts every frontend developer needs cold — how they connect to interviews, code review, and day-to-day work.",
    category: "Technical Interview Skills",
    packId: "interview-skills",
  },
  {
    dirName: "2026-03-09_2-technical-base-44d4da",
    mp3File: "2-technical-base-44d4da.mp3",
    title: "Technical Base: Modern React & Next.js",
    description:
      "What separates junior devs from people who actually know what's happening under the hood in modern React and Next.js development.",
    category: "Technical Interview Skills",
    packId: "interview-skills",
  },
  {
    dirName: "2026-03-09_2-technical-base-9c9108",
    mp3File: "2-technical-base-9c9108.mp3",
    title: "Technical Base: Server Components & Caching",
    description:
      "The technical meat and potatoes of React and Next.js — Server Components, caching strategies, and the concepts that separate juniors from seniors.",
    category: "Technical Interview Skills",
    packId: "interview-skills",
  },
  {
    dirName: "2026-03-09_3-technical-collaboration-a6e554",
    mp3File: "3-technical-collaboration-a6e554.mp3",
    title: "Technical Collaboration: Working With Other Humans",
    description:
      "How to work with other humans while building software — why communicating your technical decisions matters as much as writing the code itself.",
    category: "Technical Interview Skills",
    packId: "interview-skills",
  },
  {
    dirName: "2026-03-09_3-technical-collaboration-b88f79",
    mp3File: "3-technical-collaboration-b88f79.mp3",
    title: "Technical Collaboration: Cross-Functional Teams",
    description:
      "Where projects soar or crash and burn — a framework for making cross-functional collaboration actually work on real engineering teams.",
    category: "Technical Interview Skills",
    packId: "interview-skills",
  },
  {
    dirName: "2026-03-09_4-role-specific-focus-2a6e90",
    mp3File: "4-role-specific-focus-2a6e90.mp3",
    title: "Role-Specific Focus: The Design Engineer",
    description:
      "A close look at the Design Engineer role — what it actually covers, why it sounds niche, and how to talk about it clearly in an interview.",
    category: "Technical Interview Skills",
    packId: "interview-skills",
  },
  {
    dirName: "2026-03-09_5-technical-leadership-e57662",
    mp3File: "5-technical-leadership-e57662.mp3",
    title: "Technical Leadership: Beyond the Title",
    description:
      "Technical leadership — the topic everyone thinks they understand until they actually have to do it. What it means to lead through technical work.",
    category: "Technical Interview Skills",
    packId: "interview-skills",
  },
  {
    dirName: "2026-03-09_6-interview-communication-83b031",
    mp3File: "6-interview-communication-83b031.mp3",
    title: "Interview Communication: Talking About Your Work",
    description:
      "How to talk about your own work in interviews without sounding like a robot reading from a script — real communication techniques that land.",
    category: "Technical Interview Skills",
    packId: "interview-skills",
  },
  {
    dirName: "2026-03-09_7-performance-accessibility-44b3de",
    mp3File: "7-performance-accessibility-44b3de.mp3",
    title: "Performance & Accessibility: Fast and Usable for Everyone",
    description:
      "Making web apps both lightning fast and usable for everyone — why performance and accessibility are two sides of the same engineering problem.",
    category: "Technical Interview Skills",
    packId: "interview-skills",
  },

  // ---- Pack: JavaScript & TypeScript Deep Dives (5 episodes) ----
  {
    dirName: "2026-03-09_javascript-core-046712",
    mp3File: "javascript-core-046712.mp3",
    title: "JavaScript Core: Fundamentals That Separate Juniors From Seniors",
    description:
      "The fundamental JavaScript concepts that separate junior from senior developers — the things that come up in every single interview.",
    category: "JavaScript & TypeScript Deep Dives",
    packId: "js-ts-deep-dives",
  },
  {
    dirName: "2026-03-09_javascript-advanced-language-features-ecdc41",
    mp3File: "javascript-advanced-language-features-ecdc41.mp3",
    title: "Advanced JavaScript Language Features",
    description:
      "A tour of JavaScript's more advanced language features — the corners of the language that separate comfortable users from people who really know it.",
    category: "JavaScript & TypeScript Deep Dives",
    packId: "js-ts-deep-dives",
  },
  {
    dirName: "2026-03-09_javascript-deep-dive-e953bb",
    mp3File: "javascript-deep-dive-e953bb.mp3",
    title: "JavaScript Deep Dive: Closures, the Event Loop & Prototypes",
    description:
      "Closures, the event loop, and prototypes — the stuff that separates the JavaScript dabblers from the people who actually know what's happening under the hood.",
    category: "JavaScript & TypeScript Deep Dives",
    packId: "js-ts-deep-dives",
  },
  {
    dirName: "2026-03-09_typescript-deep-dive-044759",
    mp3File: "typescript-deep-dive-044759.mp3",
    title: "TypeScript Deep Dive",
    description:
      "A deep dive into TypeScript's type system and how it changes the way you write and reason about JavaScript at scale.",
    category: "JavaScript & TypeScript Deep Dives",
    packId: "js-ts-deep-dives",
  },
  {
    dirName: "2026-03-09_typescript-advanced-type-system-36a254",
    mp3File: "typescript-advanced-type-system-36a254.mp3",
    title: "TypeScript's Advanced Type System",
    description:
      "Generics, conditional types, and mapped types — the advanced corners of TypeScript's type system that unlock real type safety.",
    category: "JavaScript & TypeScript Deep Dives",
    packId: "js-ts-deep-dives",
  },

  // ---- Pack: React & Frontend Architecture (7 episodes) ----
  {
    dirName: "2026-03-09_react-advanced-patterns-internals-8b4e6c",
    mp3File: "react-advanced-patterns-internals-8b4e6c.mp3",
    title: "React Advanced Patterns & Internals",
    description:
      "How React actually works under the hood, and the advanced component patterns that come from understanding its internals.",
    category: "React & Frontend Architecture",
    packId: "frontend-architecture",
  },
  {
    dirName: "2026-03-09_react-state-management-14cf04",
    mp3File: "react-state-management-14cf04.mp3",
    title: "React State Management",
    description:
      "A practical tour of React state management approaches — when to reach for local state, context, or an external store, and why.",
    category: "React & Frontend Architecture",
    packId: "frontend-architecture",
  },
  {
    dirName: "2026-03-09_frontend-architecture-a1fa89",
    mp3File: "frontend-architecture-a1fa89.mp3",
    title: "Frontend Architecture Fundamentals",
    description:
      "How to structure a frontend codebase so it scales — architecture decisions that pay off as a team and product grow.",
    category: "React & Frontend Architecture",
    packId: "frontend-architecture",
  },
  {
    dirName: "2026-03-09_css-rendering-pipeline-advanced-layout-298f57",
    mp3File: "css-rendering-pipeline-advanced-layout-298f57.mp3",
    title: "The CSS Rendering Pipeline & Advanced Layout",
    description:
      "What actually happens between writing CSS and pixels on screen — the rendering pipeline, and advanced layout techniques that depend on understanding it.",
    category: "React & Frontend Architecture",
    packId: "frontend-architecture",
  },
  {
    dirName: "2026-03-09_build-tooling-testing-94a7d5",
    mp3File: "build-tooling-testing-94a7d5.mp3",
    title: "Build Tooling & Testing",
    description:
      "How modern build tools and test strategies fit together — what to actually configure, and why, in a real frontend project.",
    category: "React & Frontend Architecture",
    packId: "frontend-architecture",
  },
  {
    dirName: "2026-04-08_design-systems-nomenclature-philosophy-1fe6a5",
    mp3File: "design-systems-nomenclature-philosophy-1fe6a5.mp3",
    title: "Design Systems: Philosophy & Naming",
    description:
      "The philosophy and terminology behind design systems — why naming conventions matter and how they hold a system together across product teams.",
    category: "React & Frontend Architecture",
    packId: "frontend-architecture",
  },
  {
    dirName: "2026-04-08_design-systems-tokens-architecture-46bd42",
    mp3File: "design-systems-tokens-architecture-46bd42.mp3",
    title: "Design Systems: Tokens & Architecture",
    description:
      "Design tokens and the architecture behind them — the plumbing behind every great UI, and why it matters once you actually understand it.",
    category: "React & Frontend Architecture",
    packId: "frontend-architecture",
  },

  // ---- Pack: Systems, Security & AI Engineering (7 episodes) ----
  {
    dirName: "2026-03-09_system-design-scalability-ab3003",
    mp3File: "system-design-scalability-ab3003.mp3",
    title: "System Design & Scalability",
    description:
      "How to reason about system design and scalability in interviews and in production — the concepts and tradeoffs that come up again and again.",
    category: "Systems, Security & AI Engineering",
    packId: "systems-security-ai",
  },
  {
    dirName: "2026-03-09_security-xss-csrf-cors-auth-8de1c7",
    mp3File: "security-xss-csrf-cors-auth-8de1c7.mp3",
    title: "Web Security: XSS, CSRF, CORS & Auth",
    description:
      "The web security fundamentals every engineer should know cold — cross-site scripting, CSRF, CORS, and how authentication ties it all together.",
    category: "Systems, Security & AI Engineering",
    packId: "systems-security-ai",
  },
  {
    dirName: "2026-03-09_technical-depth-browser-apis-performance-6be702",
    mp3File: "technical-depth-browser-apis-performance-6be702.mp3",
    title: "Browser APIs & Performance",
    description:
      "A technical deep dive into browser APIs and performance — what's actually available in the browser and how to use it to build faster apps.",
    category: "Systems, Security & AI Engineering",
    packId: "systems-security-ai",
  },
  {
    dirName: "2026-03-09_technical-depth-graphics-creative-code-7eb6fc",
    mp3File: "technical-depth-graphics-creative-code-7eb6fc.mp3",
    title: "Graphics & Creative Code",
    description:
      "A technical deep dive into graphics programming and creative coding on the web — canvas, WebGL, and the math behind visual code.",
    category: "Systems, Security & AI Engineering",
    packId: "systems-security-ai",
  },
  {
    dirName: "2026-03-09_mcp-tool-architecture-0ed240",
    mp3File: "mcp-tool-architecture-0ed240.mp3",
    title: "MCP & Tool Architecture",
    description:
      "How the Model Context Protocol structures tool use for AI agents — the architecture behind giving language models real capabilities.",
    category: "Systems, Security & AI Engineering",
    packId: "systems-security-ai",
  },
  {
    dirName: "2026-03-09_ai-orchestration-agent-systems-c95523",
    mp3File: "ai-orchestration-agent-systems-c95523.mp3",
    title: "AI Orchestration & Agent Systems",
    description:
      "How multi-step AI agent systems are orchestrated in practice — coordinating models, tools, and state across a real agentic workflow.",
    category: "Systems, Security & AI Engineering",
    packId: "systems-security-ai",
  },
  {
    dirName: "2026-03-09_product-engineering-mindset-4b78eb",
    mp3File: "product-engineering-mindset-4b78eb.mp3",
    title: "The Product Engineering Mindset",
    description:
      "What separates product-minded engineers from purely technical ones — how to connect engineering decisions back to real user and business outcomes.",
    category: "Systems, Security & AI Engineering",
    packId: "systems-security-ai",
  },
];

const PACK_LABELS: Record<string, string> = {
  "interview-skills": "Technical Interview Skills",
  "js-ts-deep-dives": "JavaScript & TypeScript Deep Dives",
  "frontend-architecture": "React & Frontend Architecture",
  "systems-security-ai": "Systems, Security & AI Engineering",
};

async function main() {
  console.log(`Loading manifest (dry-run=${DRY_RUN})...`);
  const manifest = await readManifestFromStore(OUTPUT_DIR);
  const existingSlugs = new Set(manifest.episodes.map((e) => e.slug));

  const packCounts: Record<string, number> = {};
  let uploaded = 0;
  let tagged = 0;
  let skipped = 0;

  for (const sel of SELECTIONS) {
    const slug = sel.mp3File.replace(/\.mp3$/, "");
    packCounts[sel.packId] = (packCounts[sel.packId] || 0) + 1;

    if (existingSlugs.has(slug)) {
      console.log(`SKIP (already in manifest): ${slug}`);
      skipped++;
      continue;
    }

    const dirPath = join(OUTPUT_DIR, sel.dirName);
    const mp3Path = join(dirPath, sel.mp3File);
    const mp3Stat = await stat(mp3Path);
    const durationSeconds = await getAudioDuration(mp3Path);
    const transcript = await readFile(join(dirPath, "transcript.txt"), "utf-8").catch(() => "");
    const wordCount = transcript.split(/\s+/).filter(Boolean).length;

    // pubDate parsed from dirName (format: YYYY-MM-DD_slug)
    const dateMatch = sel.dirName.match(/^(\d{4}-\d{2}-\d{2})_/);
    const pubDate = dateMatch ? new Date(dateMatch[1]).toISOString() : mp3Stat.mtime.toISOString();

    let blobUrl: string | undefined;
    if (!DRY_RUN) {
      const buffer = await readFile(mp3Path);
      console.log(`Uploading ${slug} (${(mp3Stat.size / 1024 / 1024).toFixed(1)}MB)...`);
      blobUrl = await uploadEpisodeAudio(slug, buffer);
      uploaded++;
    } else {
      console.log(`[dry-run] would upload ${slug}`);
    }

    const episode: EpisodeMeta = {
      guid: randomUUID(),
      slug,
      dirName: sel.dirName,
      title: sel.title,
      description: sel.description,
      pubDate,
      durationSeconds,
      fileSizeBytes: mp3Stat.size,
      audioFileName: sel.mp3File,
      wordCount,
      costUsd: 0, // historical episodes; cost not tracked retroactively
      blobUrl,
      category: sel.category,
      packId: sel.packId,
      isCurated: true,
    };

    manifest.episodes.push(episode);
    tagged++;
  }

  console.log("\nPack summary:");
  for (const [packId, count] of Object.entries(packCounts)) {
    console.log(`  ${PACK_LABELS[packId]} (${packId}): ${count} episodes`);
  }
  console.log(`\nUploaded: ${uploaded}, Tagged: ${tagged}, Skipped (already present): ${skipped}`);

  if (!DRY_RUN) {
    console.log("Writing manifest back to store...");
    await writeManifestToStore(OUTPUT_DIR, manifest);
    console.log("Done.");
  } else {
    console.log("[dry-run] manifest NOT written.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
