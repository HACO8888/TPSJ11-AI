import { afterEach, describe, expect, it } from "vitest";
import { generateImage, withImageRetry } from "./aiClient";
import { HttpError } from "./http";

// Instant sleep so the tests don't actually wait on backoff.
const noSleep = async () => {};

const busy = () => new HttpError(502, "UPSTREAM_BUSY", "忙線", { upstreamStatus: 500 });
const quota = () => new HttpError(502, "UPSTREAM_CAPACITY", "額度用盡", { upstreamStatus: 500 });
const rejected = () => new HttpError(502, "UPSTREAM", "AI 服務錯誤", { upstreamStatus: 400 });

describe("withImageRetry", () => {
  it("retries a transient BUSY failure then succeeds", async () => {
    let attempts = 0;
    const result = await withImageRetry(
      async () => {
        attempts++;
        if (attempts < 3) throw busy();
        return "ok";
      },
      undefined,
      { sleep: noSleep, maxRetries: 2 },
    );
    expect(result).toBe("ok");
    expect(attempts).toBe(3);
  });

  it("does NOT retry real quota exhaustion (fails on the first try)", async () => {
    let attempts = 0;
    await expect(
      withImageRetry(
        async () => {
          attempts++;
          throw quota();
        },
        undefined,
        { sleep: noSleep },
      ),
    ).rejects.toMatchObject({ code: "UPSTREAM_CAPACITY" });
    expect(attempts).toBe(1);
  });

  it("does NOT retry a rejected prompt (upstreamStatus 400)", async () => {
    let attempts = 0;
    await expect(
      withImageRetry(
        async () => {
          attempts++;
          throw rejected();
        },
        undefined,
        { sleep: noSleep },
      ),
    ).rejects.toThrow();
    expect(attempts).toBe(1);
  });

  it("gives up after maxRetries and throws the last error", async () => {
    let attempts = 0;
    await expect(
      withImageRetry(
        async () => {
          attempts++;
          throw busy();
        },
        undefined,
        { sleep: noSleep, maxRetries: 2 },
      ),
    ).rejects.toMatchObject({ code: "UPSTREAM_BUSY" });
    expect(attempts).toBe(3); // 1 initial + 2 retries
  });

  it("stops retrying once the signal is aborted mid-flight", async () => {
    const ac = new AbortController();
    let attempts = 0;
    await expect(
      withImageRetry(
        async () => {
          attempts++;
          ac.abort();
          throw busy();
        },
        ac.signal,
        { sleep: noSleep },
      ),
    ).rejects.toThrow();
    expect(attempts).toBe(1);
  });

  it("returns a first-try success without sleeping", async () => {
    let slept = 0;
    const result = await withImageRetry(async () => "img", undefined, {
      sleep: async () => {
        slept++;
      },
    });
    expect(result).toBe("img");
    expect(slept).toBe(0);
  });
});

// End-to-end: drives the real generateImage chain (fetch → upstreamError → classify →
// HttpError → withImageRetry → isRetryableUpstream). Proves the actual production path
// recovers from the exact "no healthy provider" blip the user was hitting.
describe("generateImage end-to-end retry", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("retries a real 'no healthy provider' 500 then succeeds on the 3rd try", async () => {
    const jpegB64 = Buffer.from([0xff, 0xd8, 0xff, 0xe0]).toString("base64");
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      if (calls < 3) {
        return {
          ok: false,
          status: 500,
          statusText: "Internal Server Error",
          url: "https://gateway.test/v1/images/generations",
          text: async () =>
            '{"error":{"message":"[API Service] No healthy provider found in pool for gemini-antigravity supporting model: gemini-3.1-flash-image","type":"server_error"}}',
        } as unknown as Response;
      }
      return {
        ok: true,
        json: async () => ({ data: [{ b64_json: jpegB64 }] }),
      } as unknown as Response;
    }) as typeof fetch;

    const result = await generateImage("畫一隻戴童軍帽的狗");
    expect(result.mime).toBe("image/jpeg");
    expect(calls).toBe(3);
  }, 15000);

  it("does NOT retry a rejected prompt (400) — fails fast on the first call", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return {
        ok: false,
        status: 400,
        statusText: "Bad Request",
        url: "https://gateway.test/v1/images/generations",
        text: async () =>
          '{"error":{"message":"Image generation rejected: 這裡是為您設計的徽章…","type":"invalid_request_error"}}',
      } as unknown as Response;
    }) as typeof fetch;

    await expect(generateImage("設計一個徽章")).rejects.toThrow();
    expect(calls).toBe(1);
  });
});
