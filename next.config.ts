import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["dotenv", "ffmpeg-static", "ffprobe-static"],
  outputFileTracingIncludes: {
    "/api/podcast/generate": ["./node_modules/ffmpeg-static/ffmpeg"],
    "/api/podcast/generate-weekly": ["./node_modules/ffmpeg-static/ffmpeg"],
  },
};

export default nextConfig;
