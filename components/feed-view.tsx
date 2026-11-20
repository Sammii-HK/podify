import { Rss } from "lucide-react";
import type { EpisodeMeta } from "@/lib/types";
import PodifyShell from "./podify-shell";
import { FeedEpisodeList } from "@/app/feed/episode-list";
export default function FeedView({
  episodes,
  review = false,
}: {
  episodes: EpisodeMeta[];
  review?: boolean;
}) {
  return (
    <PodifyShell current="feed">
      <main id="main" className="feed-main">
        <header className="feed-hero">
          <div>
            <p className="eyebrow">The episode feed</p>
            <h1>
              A shelf for
              <br />
              <span>your next listen.</span>
            </h1>
          </div>
          <div>
            <p>
              Browse the episodes, find a thread and take the conversation with
              you.
            </p>
            {!review && (
              <a
                className="secondary-button"
                href="/api/podcast/feed"
                target="_blank"
                rel="noreferrer"
              >
                <Rss aria-hidden size={16} />
                Open RSS XML
              </a>
            )}
          </div>
        </header>
        <FeedEpisodeList episodes={episodes} audioEnabled={!review} />
      </main>
    </PodifyShell>
  );
}
