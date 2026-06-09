// Prune private interview-prep / n8n episodes from the blob-backed feed manifest.
// Usage:
//   node scripts/prune-private-episodes.mjs            # dry run, lists what would go
//   node scripts/prune-private-episodes.mjs --apply    # delete blobs + rewrite manifest

import { list, put, del } from "@vercel/blob";
import { readFileSync } from "fs";

// Load BLOB_READ_WRITE_TOKEN from .env.local
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf-8");
for (const line of env.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const APPLY = process.argv.includes("--apply");

const { blobs } = await list({ prefix: "feed.json" });
const feedBlob = blobs.find((b) => b.pathname === "feed.json");
if (!feedBlob) {
  console.error("No feed.json blob found");
  process.exit(1);
}
const manifest = await (await fetch(feedBlob.url)).json();
const episodes = manifest.episodes ?? [];

const isGrimoire = (ep) => ep.source === "grimoire";
const keep = episodes.filter(isGrimoire);
const remove = episodes.filter((ep) => !isGrimoire(ep));

console.log(`Total episodes: ${episodes.length}`);
console.log(`Grimoire (keep): ${keep.length}`);
console.log(`Private/non-grimoire (remove): ${remove.length}\n`);
console.log("--- WILL REMOVE ---");
for (const ep of remove) {
  console.log(`  [${ep.source ?? "no-source"}] ${ep.slug}  ${ep.blobUrl ? "(blob)" : "(no blob)"}`);
}

if (!APPLY) {
  console.log("\nDry run. Re-run with --apply to delete blobs and rewrite manifest.");
  process.exit(0);
}

let deleted = 0;
for (const ep of remove) {
  if (ep.blobUrl) {
    try {
      await del(ep.blobUrl);
      deleted++;
    } catch (e) {
      console.error(`  failed to delete blob ${ep.slug}: ${e.message}`);
    }
  }
}

manifest.episodes = keep;
await put("feed.json", JSON.stringify(manifest, null, 2), {
  access: "public",
  addRandomSuffix: false,
  allowOverwrite: true,
  contentType: "application/json",
});

console.log(`\nDeleted ${deleted} blobs. Manifest rewritten with ${keep.length} grimoire episodes.`);
