// ============================================================
// One-off content-ops script: remove a single episode from the
// Starter Content Library curation without deleting its audio.
//
// Episode "2026-03-09_4-role-specific-focus-2a6e90" (slug:
// "4-role-specific-focus-2a6e90") is built entirely around the
// specific job title "Design Engineer" tied to the product
// owner's personal job search (confirmed via direct transcript
// read). Not appropriate for a generic "base" interview-prep
// pack sold as a product — pull it from curation so it's
// excluded from the interview-skills pack and from the
// /api/library route's output, but keep the underlying audio
// blob and manifest entry intact.
//
// Usage: npx tsx scripts/uncurate-role-specific-focus.ts [--dry-run]
// ============================================================

import { join } from "path";
import dotenv from "dotenv";
dotenv.config({ path: join(process.cwd(), ".env.local") });
import { readManifestFromStore, writeManifestToStore } from "../lib/storage";

const OUTPUT_DIR = ".podify-output";
const DRY_RUN = process.argv.includes("--dry-run");
const TARGET_SLUG = "4-role-specific-focus-2a6e90";

async function main() {
  console.log(`Loading manifest (dry-run=${DRY_RUN})...`);
  const manifest = await readManifestFromStore(OUTPUT_DIR);

  const episode = manifest.episodes.find((e) => e.slug === TARGET_SLUG);
  if (!episode) {
    console.error(`Episode with slug "${TARGET_SLUG}" not found in manifest.`);
    process.exit(1);
  }

  console.log(`Found episode: "${episode.title}" (packId=${episode.packId}, isCurated=${episode.isCurated})`);

  episode.isCurated = false;

  console.log(`Set isCurated=false for "${episode.title}".`);

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
