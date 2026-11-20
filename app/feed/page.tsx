import { readManifest } from "@/lib/feed";
import FeedView from "@/components/feed-view";
export const dynamic = "force-dynamic";
const OUTPUT_DIR = process.env.VERCEL
  ? "/tmp/.podify-output"
  : ".podify-output";
export default async function FeedPage() {
  const manifest = await readManifest(OUTPUT_DIR);
  return <FeedView episodes={manifest.episodes} />;
}
