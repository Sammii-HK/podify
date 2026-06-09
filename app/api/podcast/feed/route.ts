import { NextResponse } from "next/server";
import { readManifest } from "@/lib/feed";
import { EpisodeMeta, ShowConfig } from "@/lib/types";

const OUTPUT_DIR = ".podify-output";

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
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

function buildChannelXml(show: ShowConfig, feedUrl: string): string {
  const categoryXml = show.subcategory
    ? `    <itunes:category text="${escapeXml(show.category)}"><itunes:category text="${escapeXml(show.subcategory)}" /></itunes:category>`
    : `    <itunes:category text="${escapeXml(show.category)}" />`;

  return `    <title>${escapeXml(show.title)}</title>
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
${categoryXml}
    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml" />`;
}

function buildItemXml(episode: EpisodeMeta, baseUrl: string, episodeIndex: number): string {
  // Use blob URL directly in the enclosure when available — avoids redirect hops
  // that some podcast ingesters (e.g. YouTube) fail to follow
  const audioUrl = episode.blobUrl ?? `${baseUrl}/api/podcast/episodes/${encodeURIComponent(episode.slug)}/audio`;
  const episodeLink = `${baseUrl}/feed#${encodeURIComponent(episode.slug)}`;
  const episodeNumber = episodeIndex + 1;
  // Per-episode cover: use Lunary OG endpoint if grimoire, otherwise show cover
  const coverUrl = episode.source === "grimoire"
    ? `https://lunary.app/api/og/podcast-cover?title=${encodeURIComponent(episode.title)}&episode=${episodeNumber}`
    : undefined;
  return `    <item>
      <title>${escapeXml(episode.title)}</title>
      <description>${escapeXml(episode.description)}</description>
      <itunes:summary>${escapeXml(episode.description)}</itunes:summary>
      <link>${escapeXml(episodeLink)}</link>
      <pubDate>${toRfc2822(episode.pubDate)}</pubDate>
      <enclosure url="${escapeXml(audioUrl)}" length="${episode.fileSizeBytes}" type="audio/mpeg" />
      <guid isPermaLink="false">${escapeXml(episode.guid)}</guid>
      <itunes:duration>${formatDuration(episode.durationSeconds)}</itunes:duration>
      <itunes:episode>${episodeNumber}</itunes:episode>${coverUrl ? `\n      <itunes:image href="${escapeXml(coverUrl)}" />` : ""}
    </item>`;
}

export async function GET() {
  const manifest = await readManifest(OUTPUT_DIR);
  const baseUrl = (
    process.env.PODIFY_BASE_URL || "http://localhost:3456"
  ).replace(/\/$/, "");
  const feedUrl = `${baseUrl}/api/podcast/feed`;

  // Episodes are stored newest-first; number them in reverse so oldest = Ep 1
  const totalEpisodes = manifest.episodes.length;
  const items = manifest.episodes
    .map((ep, i) => buildItemXml(ep, baseUrl, totalEpisodes - i - 1))
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:itunes="http://www.itunes.apple.com/dtds/podcast-1.0.dtd"
  xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
${buildChannelXml(manifest.show, feedUrl)}
    <itunes:type>episodic</itunes:type>
${items}
  </channel>
</rss>`;

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
    },
  });
}
