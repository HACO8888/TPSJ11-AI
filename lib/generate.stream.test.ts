import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "./http";

// Isolate the DB / gateway / drive so we can assert the SSE event *sequence* the stream
// emits for each route — the contract both /chat and /regenerate depend on, and where
// the adversarial review found the mixed→fallback risk.
vi.mock("@/db/queries", () => ({
  loadContextRows: vi.fn(async () => []),
  hasRecentImageMessage: vi.fn(async () => false),
  getMessageAttachments: vi.fn(async () => []),
  getLatestGeneratedImage: vi.fn(async () => null),
  createImageMessage: vi.fn(async () => ({ imageId: "img1", messageId: "msg1" })),
  persistAssistant: vi.fn(async () => ({ id: "asst1" })),
  getSessionRow: vi.fn(async () => null),
  listGeneratedImages: vi.fn(async () => []),
  // image-quota deps (real module, mocked DB): null settings → defaults, 0 used today.
  getSetting: vi.fn(async () => null),
  countUserImagesToday: vi.fn(async () => 0),
}));
vi.mock("./drive", () => ({ saveSessionImagesToCloud: vi.fn() }));
vi.mock("./errors", () => ({ logError: vi.fn(async () => "REF123") }));
vi.mock("./aiClient", () => ({
  chatOnce: vi.fn(),
  chatStream: vi.fn(),
  generateImage: vi.fn(),
  generateImageEdit: vi.fn(),
}));
vi.mock("./intent", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./intent")>()),
  classifyImageIntent: vi.fn(),
  draftImageCaption: vi.fn(async () => "draft caption"),
}));

const { chatStream, generateImage } = await import("./aiClient");
const { classifyImageIntent } = await import("./intent");
const { buildGenerationStream } = await import("./generate");

/** A fake upstream chat Response whose body streams OpenAI-style SSE chunks. */
function chatBody(text: string): Response {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(
        enc.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`),
      );
      c.enqueue(enc.encode("data: [DONE]\n\n"));
      c.close();
    },
  });
  return { body } as Response;
}

/** Drive the stream to completion and return the parsed (event, data) sequence. */
async function collect(
  content: string,
): Promise<{ event: string; data: Record<string, unknown> }[]> {
  const stream = buildGenerationStream({
    sessionId: "s1",
    userId: "u-test",
    content,
    userMessageId: "u1",
    signal: new AbortController().signal,
  });
  const reader = stream.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
  }
  const events: { event: string; data: Record<string, unknown> }[] = [];
  for (const rec of buf.split("\n\n")) {
    const ev = rec
      .split("\n")
      .find((l) => l.startsWith("event:"))
      ?.slice(6)
      .trim();
    const d = rec
      .split("\n")
      .find((l) => l.startsWith("data:"))
      ?.slice(5)
      .trim();
    if (ev && d) events.push({ event: ev, data: JSON.parse(d) });
  }
  return events;
}

const IMG_OK = { buf: Buffer.from([0xff, 0xd8]), mime: "image/jpeg", width: 100, height: 100 };

beforeEach(() => {
  vi.mocked(chatStream).mockReset();
  vi.mocked(generateImage).mockReset();
  vi.mocked(classifyImageIntent).mockReset();
});

describe("buildGenerationStream event sequence", () => {
  it("plain chat streams meta → route(chat) → delta → done", async () => {
    vi.mocked(chatStream).mockResolvedValue(chatBody("哈囉！"));
    const events = await collect("這個活動在哪辦");
    expect(events.map((e) => e.event)).toEqual(["meta", "route", "delta", "done"]);
    expect(events[1].data).toMatchObject({ kind: "chat" });
    expect(events[2].data).toMatchObject({ text: "哈囉！" });
  });

  it("mixed image streams the caption BEFORE the image: route(mixed) → delta → image → done", async () => {
    vi.mocked(classifyImageIntent).mockResolvedValue({
      image: true,
      ready: true,
      edit: false,
      prompt: "一隻在營火旁的狼",
      caption: "這是為你畫的營火狼 🐺",
    });
    vi.mocked(generateImage).mockResolvedValue(IMG_OK);

    const events = await collect("幫我畫一隻在營火旁的狼");
    expect(events.map((e) => e.event)).toEqual(["meta", "route", "delta", "image", "done"]);
    expect(events[1].data).toMatchObject({ kind: "mixed", prompt: "一隻在營火旁的狼" });
    expect(events[2].data).toMatchObject({ text: "這是為你畫的營火狼 🐺" });
    expect(events[3].data).toMatchObject({ imageId: "img1", imageUrl: "/api/images/img1" });
  });

  it("mixed→no-output falls back: emits a SECOND route(chat) after the caption so the client resets its buffer", async () => {
    vi.mocked(classifyImageIntent).mockResolvedValue({
      image: true,
      ready: true,
      edit: false,
      prompt: "一張海報",
      caption: "來畫張海報 🎨",
    });
    vi.mocked(generateImage).mockRejectedValue(
      new HttpError(502, "IMAGE_NO_OUTPUT", "這次沒有生成出圖片", { upstreamStatus: 500 }),
    );
    vi.mocked(chatStream).mockResolvedValue(chatBody("這次沒能生成出圖片，換個描述再試試？"));

    const events = await collect("幫我畫一張海報");
    // caption is streamed, then a fresh route(chat) precedes the fallback text — the
    // signal the client uses to discard the caption (acc reset) instead of concatenating.
    expect(events.map((e) => e.event)).toEqual([
      "meta",
      "route",
      "delta",
      "route",
      "delta",
      "done",
    ]);
    expect(events[1].data).toMatchObject({ kind: "mixed" });
    expect(events[2].data).toMatchObject({ text: "來畫張海報 🎨" });
    expect(events[3].data).toMatchObject({ kind: "chat" });
    expect(events[4].data).toMatchObject({ text: "這次沒能生成出圖片，換個描述再試試？" });
  });

  it("upstream capacity during image → calm chat message, no scary error", async () => {
    vi.mocked(classifyImageIntent).mockResolvedValue({
      image: true,
      ready: true,
      edit: false,
      prompt: "一張圖",
      caption: "來畫圖 🖼️",
    });
    vi.mocked(generateImage).mockRejectedValue(
      new HttpError(502, "UPSTREAM_CAPACITY", "額度用盡", { upstreamStatus: 500 }),
    );

    // A concrete subject so it routes to image (not a bare/vague request).
    const events = await collect("幫我畫一張營火晚會海報");
    expect(events.map((e) => e.event)).toEqual([
      "meta",
      "route",
      "delta",
      "route",
      "delta",
      "done",
    ]);
    expect(events[3].data).toMatchObject({ kind: "chat" });
    // Real quota exhaustion → an honest "額度已用盡" message (distinct from a busy blip).
    expect(String(events[4].data.text)).toContain("額度已用盡");
    // never an error event
    expect(events.some((e) => e.event === "error")).toBe(false);
  });

  it("upstream busy (no healthy provider) → honest 忙線 message, not a quota message, no error", async () => {
    vi.mocked(classifyImageIntent).mockResolvedValue({
      image: true,
      ready: true,
      edit: false,
      prompt: "一張圖",
      caption: "來畫圖 🖼️",
    });
    // A transient gateway "no healthy provider" that aiClient already auto-retried and
    // still failed — must degrade to a calm BUSY message, never "你的額度用盡".
    vi.mocked(generateImage).mockRejectedValue(
      new HttpError(502, "UPSTREAM_BUSY", "圖片服務暫時忙線中，請稍後再試", {
        upstreamStatus: 500,
      }),
    );

    const events = await collect("幫我畫一張營火晚會海報");
    expect(events[3].data).toMatchObject({ kind: "chat" });
    expect(String(events[4].data.text)).toContain("忙線");
    expect(String(events[4].data.text)).not.toContain("額度");
    expect(events.some((e) => e.event === "error")).toBe(false);
  });
});
