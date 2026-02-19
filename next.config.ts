import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["dotenv", "ffmpeg-static"],
  async rewrites() {
    return [
      {
        source: "/api/podcast/episodes/:slug/audio.mp3",
        destination: "/api/podcast/episodes/:slug/audio",
      },
    ];
  },
};

export default nextConfig;
