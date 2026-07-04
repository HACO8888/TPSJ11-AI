import { afterEach, describe, expect, it, vi } from "vitest";
import { imageChatOnce } from "./aiClient";

// A real 1×1 PNG (magic bytes 89 50 4E 47 → sniffMime detects image/png).
const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const PNG_DATA_URI = `data:image/png;base64,${PNG_B64}`;

function mockMessage(message: unknown) {
  global.fetch = vi.fn(
    async () => new Response(JSON.stringify({ choices: [{ message }] }), { status: 200 }),
    // biome-ignore lint/suspicious/noExplicitAny: test double for global.fetch
  ) as any;
}

afterEach(() => vi.restoreAllMocks());

describe("imageChatOnce (Strategy A parser)", () => {
  it("extracts an image from message.images[] image_url data URIs", async () => {
    mockMessage({ content: "這是你的圖", images: [{ image_url: { url: PNG_DATA_URI } }] });
    const { text, image } = await imageChatOnce("畫一隻狗");
    expect(text).toBe("這是你的圖");
    expect(image?.mime).toBe("image/png");
    expect(image).toMatchObject({ width: 1, height: 1 });
  });

  it("extracts an image from message.images[] b64_json", async () => {
    mockMessage({ content: "圖來了", images: [{ b64_json: PNG_B64 }] });
    const { image } = await imageChatOnce("畫一隻貓");
    expect(image?.mime).toBe("image/png");
  });

  it("extracts an image_url part and text from a content array", async () => {
    mockMessage({
      content: [
        { type: "text", text: "營火海報" },
        { type: "image_url", image_url: { url: PNG_DATA_URI } },
      ],
    });
    const { text, image } = await imageChatOnce("海報");
    expect(text).toBe("營火海報");
    expect(image).not.toBeNull();
  });

  it("extracts a data-uri embedded in a markdown content string and strips it from the text", async () => {
    mockMessage({ content: `這是圖 ![](${PNG_DATA_URI})` });
    const { text, image } = await imageChatOnce("圖");
    expect(image).not.toBeNull();
    expect(text).toBe("這是圖");
    expect(text).not.toContain("data:image");
  });

  it("returns image=null for a plain text reply (→ caller falls back)", async () => {
    mockMessage({ content: "抱歉，我只能描述這張圖。" });
    const { text, image } = await imageChatOnce("圖");
    expect(image).toBeNull();
    expect(text).toContain("抱歉");
  });
});
