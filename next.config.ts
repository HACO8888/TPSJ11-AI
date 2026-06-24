import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Build a self-contained server bundle (node server.js) for the Docker image.
  output: "standalone",
};

export default nextConfig;
