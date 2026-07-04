import { describe, expect, it, vi } from "vitest";
import type { ImageReference } from "./aiClient";
import { decideImageRoute, type RouteDeps } from "./generate";
import type { ImageVerdict } from "./intent";

const REF: ImageReference = { bytes: Buffer.from("x"), mime: "image/png" };

function deps(
  verdict: Partial<ImageVerdict> = {},
  editRef: ImageReference | null = REF,
): RouteDeps & { classify: ReturnType<typeof vi.fn> } {
  const v: ImageVerdict = {
    image: false,
    ready: false,
    edit: false,
    prompt: "",
    caption: "",
    ...verdict,
  };
  return {
    classify: vi.fn(async () => v),
    getEditRef: vi.fn(async () => editRef),
  };
}

const base = {
  forced: false,
  forcedPrompt: "",
  history: [] as { role: "user" | "assistant"; content: string }[],
  hasPriorContent: false,
  recentImage: false,
  attachments: [] as ImageReference[],
};

describe("decideImageRoute", () => {
  it("routes plain chat without calling the classifier", async () => {
    const d = deps();
    const r = await decideImageRoute({ ...base, content: "這活動在哪辦" }, d);
    expect(r.kind).toBe("chat");
    expect(d.classify).not.toHaveBeenCalled();
  });

  it("honours a forced /image prompt without the classifier", async () => {
    const d = deps();
    const r = await decideImageRoute(
      { ...base, content: "/image 一隻狼", forced: true, forcedPrompt: "一隻狼" },
      d,
    );
    expect(r).toMatchObject({ kind: "image", imagePrompt: "一隻狼", imageRef: null });
    expect(d.classify).not.toHaveBeenCalled();
  });

  it("uses the attachment as the edit reference on a forced request", async () => {
    const r = await decideImageRoute(
      { ...base, content: "/image Q版", forced: true, forcedPrompt: "Q版", attachments: [REF] },
      deps(),
    );
    expect(r).toMatchObject({ kind: "image", imageRef: REF });
  });

  it("turns an uploaded 素材 into an image when the classifier says so", async () => {
    const r = await decideImageRoute(
      { ...base, content: "改成卡通", attachments: [REF] },
      deps({ image: true, prompt: "卡通版的貓" }),
    );
    expect(r).toMatchObject({ kind: "image", imagePrompt: "卡通版的貓", imageRef: REF });
  });

  it("keeps an uploaded 素材 on the chat branch for vision Q&A", async () => {
    const r = await decideImageRoute(
      { ...base, content: "這是什麼", attachments: [REF] },
      deps({ image: false }),
    );
    expect(r.kind).toBe("chat");
  });

  it("flags a first-turn bare image request as vague (no classifier call)", async () => {
    const d = deps();
    const r = await decideImageRoute({ ...base, content: "幫我畫" }, d);
    expect(r).toMatchObject({ kind: "chat", vagueImage: true });
    expect(d.classify).not.toHaveBeenCalled();
  });

  it("generates when a cued request classifies as a ready image", async () => {
    const r = await decideImageRoute(
      { ...base, content: "幫我畫一張營火海報" },
      deps({ image: true, ready: true, prompt: "營火海報" }),
    );
    expect(r).toMatchObject({ kind: "image", imagePrompt: "營火海報" });
  });

  it("stays vague when a cued request is an image but not ready", async () => {
    const r = await decideImageRoute(
      { ...base, content: "幫我畫個東西啦" },
      deps({ image: true, ready: false }),
    );
    expect(r).toMatchObject({ kind: "chat", vagueImage: true });
  });

  it("pulls the previous image as an i2i reference for an edit follow-up", async () => {
    const r = await decideImageRoute(
      { ...base, content: "卡通版的", recentImage: true },
      deps({ image: true, ready: true, edit: true, prompt: "卡通版的狼" }),
    );
    expect(r).toMatchObject({ kind: "image", imageRef: REF });
  });
});
