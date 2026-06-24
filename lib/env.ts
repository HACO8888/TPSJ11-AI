import "server-only";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.string().url(),
  AI_API_BASE_URL: z.string().url(),
  AI_API_KEY: z.string().min(1),
  AI_TEXT_MODEL: z.string().default("gemini-flash-latest"),
  AI_IMAGE_MODEL: z.string().default("gemini-3.1-flash-image"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET 至少需 32 字元"),
});

type Env = z.infer<typeof schema>;

let cached: Env | undefined;

// Validate lazily on first access (not at import). This keeps `next build`
// from failing when env vars are absent at build time (e.g. Zeabur/Docker
// builds inject secrets only at runtime). The first runtime read validates.
function load(): Env {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      console.error(
        "❌ 環境變數驗證失敗:\n",
        JSON.stringify(z.treeifyError(parsed.error), null, 2),
      );
      throw new Error("Invalid environment configuration");
    }
    cached = parsed.data;
  }
  return cached;
}

export const env: Env = new Proxy({} as Env, {
  get(_target, prop) {
    return load()[prop as keyof Env];
  },
});
