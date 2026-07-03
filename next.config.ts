import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Build a self-contained server bundle (node server.js) for the Docker image.
  output: "standalone",
  // sharp is a native module — keep it external (loaded from node_modules at runtime)
  // rather than bundled, so its platform binary resolves correctly in the container.
  serverExternalPackages: ["sharp"],
  // sharp's binding dlopens libvips (a .so shipped in @img/sharp-libvips-*) at runtime.
  // The file tracer can't see that dynamic dependency, so the standalone bundle was
  // missing libvips-cpp.so → "ERR_DLOPEN_FAILED". Force every @img package (binding +
  // libvips) into the trace so image resize / cloud-save 小 size work in the container.
  outputFileTracingIncludes: {
    "/api/**": ["./node_modules/.pnpm/@img+**", "./node_modules/@img/**"],
  },
};

export default nextConfig;
