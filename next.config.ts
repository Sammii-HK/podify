import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["dotenv", "ffmpeg-static", "ffprobe-static"],
};

export default nextConfig;
