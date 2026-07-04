import { defineConfig } from "vitest/config";

// First test infrastructure for the project. Runs in a plain Node environment against
// the pure helper modules (intent rules, byte sniffing, context trimming, upstream
// error classification). Two aliases keep those imports resolvable without a full
// Next.js/webpack pipeline:
//   • `@/*`         → project root (mirrors tsconfig paths)
//   • `server-only` → an empty stub (the real package throws outside a Server bundle)
// `test.env` injects dummy secrets so any module that lazily reads `env` (Proxy in
// lib/env.ts) won't fail validation during a test run.
export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\//, replacement: `${import.meta.dirname}/` },
      { find: /^server-only$/, replacement: `${import.meta.dirname}/test/server-only-stub.ts` },
    ],
  },
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["node_modules", ".next", "drizzle"],
    env: {
      DATABASE_URL: "postgres://test:test@localhost:5432/test?sslmode=disable",
      AI_API_BASE_URL: "https://gateway.test/v1",
      AI_API_KEY: "test-key",
      AI_TEXT_MODEL: "test-text-model",
      AI_IMAGE_MODEL: "test-image-model",
      SESSION_SECRET: "test-session-secret-at-least-32-characters",
    },
  },
});
