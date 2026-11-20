import { AudioLines, ArrowUpRight, Headphones, Rss } from "lucide-react";
export default function PodifyShell({
  children,
  current = "studio",
}: {
  children: React.ReactNode;
  current?: "studio" | "feed";
}) {
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <header className="site-header">
        <a href="/" className="wordmark">
          <AudioLines aria-hidden size={25} />
          Podify<span>the listening room</span>
        </a>
        <nav aria-label="Main">
          <a href="/" aria-current={current === "studio" ? "page" : undefined}>
            <Headphones aria-hidden size={16} />
            Studio
          </a>
          <a
            href="/feed"
            aria-current={current === "feed" ? "page" : undefined}
          >
            <Rss aria-hidden size={16} />
            Episode feed
          </a>
          <a href="https://sammii.dev" target="_blank" rel="noreferrer">
            Sammii’s lab
            <ArrowUpRight aria-hidden size={15} />
          </a>
        </nav>
      </header>
      {children}
      <footer className="site-footer">
        <span>Made for a more considered listen.</span>
        <a href="/feed">
          Browse the episode feed
          <ArrowUpRight aria-hidden size={15} />
        </a>
      </footer>
    </>
  );
}
