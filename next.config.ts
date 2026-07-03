import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Build a self-contained server bundle (node server.js) for the Docker image.
  output: "standalone",
  // sharp is a native module — keep it external (loaded from node_modules at runtime)
  // rather than bundled, so its platform binary resolves correctly in the container.
  serverExternalPackages: ["sharp"],
};

export default nextConfig;
