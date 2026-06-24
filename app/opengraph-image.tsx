import { ImageResponse } from "next/og";

export const alt = "臺北市第 11 次大露營 AI 助理";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Load a Noto Sans TC subset (only the glyphs we render) so satori can draw CJK.
async function loadFont(text: string, weight: number): Promise<ArrayBuffer | null> {
  const url = `https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@${weight}&text=${encodeURIComponent(text)}`;
  try {
    const css = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
    }).then((r) => r.text());
    const src = css.match(/src:\s*url\(([^)]+)\)/)?.[1];
    if (!src) return null;
    return await fetch(src).then((r) => r.arrayBuffer());
  } catch {
    return null;
  }
}

export default async function OpengraphImage() {
  const title = "臺北市第 11 次大露營";
  const sub = "AI 助理";
  const tag = "對話 · 生圖 · 童軍營地";
  const glyphs = `${title}${sub}${tag}`;

  const [bold, regular] = await Promise.all([loadFont(glyphs, 700), loadFont(glyphs, 400)]);
  const fonts = [];
  if (bold)
    fonts.push({ name: "NotoTC", data: bold, weight: 700 as const, style: "normal" as const });
  if (regular)
    fonts.push({ name: "NotoTC", data: regular, weight: 400 as const, style: "normal" as const });

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "90px",
        background: "linear-gradient(135deg, #225f37 0%, #14180f 70%)",
        color: "#e9e6d9",
        fontFamily: "NotoTC, sans-serif",
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          right: -140,
          top: -140,
          width: 560,
          height: 560,
          borderRadius: 560,
          background: "radial-gradient(circle, rgba(240,136,75,0.55), rgba(240,136,75,0))",
        }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 30 }}>
        {/* biome-ignore lint/a11y/noSvgWithoutTitle: decorative mark in a generated OG image */}
        <svg width="64" height="64" viewBox="0 0 24 24">
          <path
            d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"
            fill="#f0884b"
          />
        </svg>
        <div style={{ fontSize: 32, color: "#9fc6a6", letterSpacing: 3 }}>{tag}</div>
      </div>
      <div style={{ display: "flex", fontSize: 92, fontWeight: 700, lineHeight: 1.1 }}>{title}</div>
      <div
        style={{ display: "flex", fontSize: 64, fontWeight: 700, color: "#6fc07c", marginTop: 10 }}
      >
        {sub}
      </div>
    </div>,
    { ...size, fonts: fonts.length ? fonts : undefined },
  );
}
