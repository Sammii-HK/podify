import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["dotenv", "ffmpeg-static", "ffprobe-static"],
  outputFileTracingIncludes: {
    "/api/**": [
      "./node_modules/ffmpeg-static/**/*",
      "./node_modules/ffprobe-static/**/*",
    ],
  },
};

export default nextConfig;
