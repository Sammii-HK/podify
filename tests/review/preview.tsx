import { createRoot } from "react-dom/client";
import { useState } from "react";
import PodifyShell from "../../components/podify-shell";
import PodcastForm from "../../components/podcast-form";
import { ProgressDisplay } from "../../components/generation-progress";
import PodcastPlayer from "../../components/podcast-player";
import TranscriptView from "../../components/transcript-view";
import FeedView from "../../components/feed-view";
import { defaultBrief } from "../../lib/client-workflow";
import type { EpisodeMeta } from "../../lib/types";
const SOURCE =
  "This is a hand-written interface review sample. A small reading group meets in the library to discuss a favourite passage, notice its rhythm and consider how speaking it aloud changes the experience.";
const lines = Array.from({ length: 10 }, (_, index) => ({
  speaker: index % 2 ? "HOST_B" : "HOST_A",
  text:
    index % 2
      ? "Reading aloud gives us another way to notice the shape of a sentence. This dialogue was written for the interface review."
      : "Let us start with the passage itself, then talk about what changes when we hear it. This is illustrative text, not a generated transcript.",
}));
const episodes: EpisodeMeta[] = [
  "A small reading room",
  "On paying attention",
  "The shape of a sentence",
].map((title, index) => ({
  guid: `fixture-${index}`,
  slug: `fixture-${index}`,
  dirName: "fixture",
  title,
  description:
    "An illustrative catalogue entry written for this offline interface review. No episode or audio file was generated.",
  pubDate: "2026-11-20T09:00:00Z",
  durationSeconds: 59.6 + index * 120,
  fileSizeBytes: 0,
  audioFileName: "disconnected.mp3",
  wordCount: SOURCE.split(/\s+/).length,
  costUsd: 0,
  source: index ? "text" : "grimoire",
}));
function Review() {
  const [brief, setBrief] = useState({
      ...defaultBrief(),
      content: SOURCE,
      title: "A small reading room",
    }),
    [note, setNote] = useState(""),
    [stage, setStage] = useState<"scripting" | "audio" | "assembly">("audio");
  const path = location.pathname;
  return (
    <>
      <aside className="review-banner">
        Offline interface review. All records, progress and transcript text are
        illustrative. Generation, audio, feeds, accounts and external services
        are disconnected.
      </aside>
      <nav className="review-nav" aria-label="Review views">
        <a href="/">Brief</a>
        <a href="/progress">Progress example</a>
        <a href="/player">Player and transcript example</a>
        <a href="/feed">Feed fixtures</a>
      </nav>
      {path === "/feed" ? (
        <FeedView episodes={episodes} review />
      ) : path === "/progress" ? (
        <PodifyShell>
          <main id="main" className="review-component">
            <h1>Progress example</h1>
            <div className="review-controls">
              {(["scripting", "audio", "assembly"] as const).map((value) => (
                <button
                  type="button"
                  key={value}
                  aria-pressed={stage === value}
                  onClick={() => setStage(value)}
                >
                  {value}
                </button>
              ))}
            </div>
            <ProgressDisplay
              elapsed={83}
              snapshot={{
                id: "fixture",
                status: "processing",
                progress:
                  stage === "scripting" ? 18 : stage === "audio" ? 56 : 88,
                stage,
                message: "Illustrative stage information. No job is running.",
              }}
            />
          </main>
        </PodifyShell>
      ) : path === "/player" ? (
        <PodifyShell>
          <main id="main" className="review-component">
            <h1>Player layout example</h1>
            <PodcastPlayer
              jobId="fixture"
              durationSeconds={59.6}
              wordCount={SOURCE.split(/\s+/).length}
              costUsd={0}
              audioEnabled={false}
            />
            <TranscriptView transcript={lines} />
          </main>
        </PodifyShell>
      ) : (
        <PodifyShell>
          <main id="main" className="studio-main">
            <header className="studio-hero">
              <div>
                <p className="eyebrow">A change of medium</p>
                <h1>
                  Your words.
                  <br />
                  <span>A different way in.</span>
                </h1>
              </div>
              <p>
                Shape a conversation from something worth hearing. Choose your
                source, set the direction, then follow the episode into voices
                and sound.
              </p>
            </header>
            <div className="workspace-grid">
              <section className="brief-panel" aria-label="Episode brief">
                <div className="panel-top">
                  <span className="section-label">The brief</span>
                </div>
                {note && (
                  <div className="notice" role="status">
                    {note}
                  </div>
                )}
                <PodcastForm
                  value={brief}
                  onChange={setBrief}
                  onSubmit={() =>
                    setNote(
                      "This brief passes the local input check. No generation request was sent.",
                    )
                  }
                  review
                />
              </section>
              <aside className="studio-aside">
                <h2>A little space to listen.</h2>
                <p>
                  This review shows the actual form component with hand-written
                  source text. The brief can be edited and checked without
                  creating a job.
                </p>
                <ol>
                  <li>
                    <span>01</span>Choose the material
                  </li>
                  <li>
                    <span>02</span>Find the right voices
                  </li>
                  <li>
                    <span>03</span>Listen and read along
                  </li>
                </ol>
                <a href="/player">Inspect the disconnected player</a>
              </aside>
            </div>
          </main>
        </PodifyShell>
      )}
    </>
  );
}
createRoot(document.getElementById("root")!).render(<Review />);
