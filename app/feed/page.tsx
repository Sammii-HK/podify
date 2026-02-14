import { readManifest } from "@/lib/feed";
import { FeedEpisodeList } from "./episode-list";

export const dynamic = "force-dynamic";

const OUTPUT_DIR = process.env.VERCEL ? "/tmp/.podify-output" : ".podify-output";

export default async function FeedPage() {
  const manifest = await readManifest(OUTPUT_DIR);

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <div className="mb-8 flex items-baseline justify-between">
        <h1 className="text-2xl font-bold text-foreground">Feed Preview</h1>
        <a
          href="/api/podcast/feed"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-accent hover:underline"
        >
          RSS Feed
        </a>
      </div>

      <FeedEpisodeList episodes={manifest.episodes} />
    </main>
  );
}
