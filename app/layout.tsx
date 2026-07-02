import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { THEME_COOKIE } from "@/lib/theme-cookie";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
  title: "臺北市第 11 次大露營 AI 助理",
  description: "臺北市第 11 次大露營 — AI 對話與圖片生成",
  openGraph: {
    title: "臺北市第 11 次大露營 AI 助理",
    description: "對話 · 生圖 · 童軍營地",
    type: "website",
    locale: "zh_TW",
  },
  twitter: {
    card: "summary_large_image",
    title: "臺北市第 11 次大露營 AI 助理",
    description: "對話 · 生圖 · 童軍營地",
  },
};

export const viewport: Viewport = {
  themeColor: "#2f6b3d",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Read the theme cookie server-side so the correct palette class is on <html>
  // in the very first byte of HTML — no flash, no client script needed.
  const dark = (await cookies()).get(THEME_COOKIE)?.value === "dark";

  return (
    <html lang="zh-Hant" className={dark ? "dark" : undefined} suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Bitter:ital,wght@0,400;0,500;0,600;0,700;1,400&family=IBM+Plex+Sans+TC:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
