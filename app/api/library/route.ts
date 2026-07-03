import { NextResponse } from "next/server";
import { readManifest } from "@/lib/feed";
import { EpisodeMeta } from "@/lib/types";

const OUTPUT_DIR = ".podify-output";

// ============================================================
// GET /api/library — Starter Content Library
//
// Thin JSON wrapper around readManifest() (the same manifest read path
// /api/podcast/feed already uses for RSS/XML), scoped to curated episodes
// only. Additive — does not touch the existing public feed routes.
//
// Query params (all optional):
//   packId    — filter to a single pack, e.g. ?packId=interview-skills
//   category  — filter to a single category label (exact match)
// ============================================================

interface LibraryPack {
  packId: string;
  category: string;
  episodeCount: number;
  episodes: EpisodeMeta[];
}

export async function GET(request: Request) {
  const manifest = await readManifest(OUTPUT_DIR);
  const { searchParams } = new URL(request.url);
  const packIdFilter = searchParams.get("packId");
  const categoryFilter = searchParams.get("category");

  let curated = manifest.episodes.filter((ep) => ep.isCurated);

  if (packIdFilter) {
    curated = curated.filter((ep) => ep.packId === packIdFilter);
  }
  if (categoryFilter) {
    curated = curated.filter((ep) => ep.category === categoryFilter);
  }

  // Group into packs, preserving manifest order within each pack.
  const packOrder: string[] = [];
  const packMap = new Map<string, LibraryPack>();

  for (const ep of curated) {
    const packId = ep.packId ?? "uncategorized";
    const category = ep.category ?? "Uncategorized";
    if (!packMap.has(packId)) {
      packOrder.push(packId);
      packMap.set(packId, { packId, category, episodeCount: 0, episodes: [] });
    }
    const pack = packMap.get(packId)!;
    pack.episodes.push(ep);
    pack.episodeCount = pack.episodes.length;
  }

  const packs = packOrder.map((id) => packMap.get(id)!);

  return NextResponse.json(
    {
      packs,
      totalEpisodes: curated.length,
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
      },
    }
  );
}
