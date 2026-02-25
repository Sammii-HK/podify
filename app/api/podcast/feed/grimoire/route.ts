import { NextResponse } from "next/server";
import { readManifest } from "@/lib/feed";
import { EpisodeMeta, ShowConfig } from "@/lib/types";

const OUTPUT_DIR = ".podify-output";

const GRIMOIRE_SHOW: ShowConfig = {
  title: "The Grimoire",
  description:
    "Astrology, witchcraft, tarot, and cosmic wisdom in bite-sized episodes. Two hosts explore everything from birth charts to crystal meanings, spells to planetary transits. Learn the real thing, powered by Lunary.",
  link: "https://lunary.app",
  language: "en",
  author: "Lunary",
  email: "hello@lunary.app",
  imageUrl: "https://podify-topaz.vercel.app/the-grimoire-cover.png",
  category: "Religion & Spirituality",
  explicit: false,
};

const SUBCATEGORY = "Spirituality";

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function cdata(str: string): string {
  // CDATA sections cannot contain "]]>" — escape it if present
  return `<![CDATA[${str.replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;
}

function toRfc2822(isoDate: string): string {
  return new Date(isoDate).toUTCString();
}

function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

function buildItemXml(episode: EpisodeMeta, baseUrl: string): string {
  const audioUrl = `${baseUrl}/api/podcast/episodes/${encodeURIComponent(episode.slug)}/audio`;
  const episodeLink = `${baseUrl}/feed#${encodeURIComponent(episode.slug)}`;
  return `    <item>
      <title>${cdata(episode.title)}</title>
      <description>${cdata(episode.description)}</description>
      <link>${escapeXml(episodeLink)}</link>
      <pubDate>${toRfc2822(episode.pubDate)}</pubDate>
      <enclosure url="${escapeXml(audioUrl)}" length="${episode.fileSizeBytes}" type="audio/mpeg" />
      <guid isPermaLink="false">${escapeXml(episode.guid)}</guid>
      <itunes:duration>${formatDuration(episode.durationSeconds)}</itunes:duration>
    </item>`;
}

export async function GET() {
  const manifest = await readManifest(OUTPUT_DIR);
  const baseUrl = (
    process.env.PODIFY_BASE_URL || "http://localhost:3456"
  ).replace(/\/$/, "");
  const feedUrl = `${baseUrl}/api/podcast/feed/grimoire`;

  const grimoireEpisodes = manifest.episodes.filter(
    (ep) => ep.source === "grimoire"
  );

  const items = grimoireEpisodes.map((ep) => buildItemXml(ep, baseUrl)).join("\n");

  const show = GRIMOIRE_SHOW;

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
  xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(show.title)}</title>
    <description>${escapeXml(show.description)}</description>
    <link>${escapeXml(show.link)}</link>
    <language>${escapeXml(show.language)}</language>
    <itunes:author>${escapeXml(show.author)}</itunes:author>
    <itunes:owner>
      <itunes:name>${escapeXml(show.author)}</itunes:name>
      <itunes:email>${escapeXml(show.email)}</itunes:email>
    </itunes:owner>
    <itunes:image href="${escapeXml(show.imageUrl)}" />
    <image>
      <url>${escapeXml(show.imageUrl)}</url>
      <title>${escapeXml(show.title)}</title>
      <link>${escapeXml(show.link)}</link>
    </image>
    <managingEditor>${escapeXml(show.email)} (${escapeXml(show.author)})</managingEditor>
    <itunes:explicit>${show.explicit ? "yes" : "no"}</itunes:explicit>
    <itunes:category text="${escapeXml(show.category)}"><itunes:category text="${escapeXml(SUBCATEGORY)}" /></itunes:category>
    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>`;

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
