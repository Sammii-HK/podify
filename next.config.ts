import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["dotenv", "ffmpeg-static"],
  async rewrites() {
    return [
      {
        source: "/rss/grimoire",
        destination: "/api/podcast/feed/grimoire",
      },
    ];
  },
};

export default nextConfig;
