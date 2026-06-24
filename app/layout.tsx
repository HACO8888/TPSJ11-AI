import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "臺北市第 11 次大露營 AI 助理",
  description: "臺北市第 11 次大露營 — AI 對話與圖片生成",
};

export const viewport: Viewport = {
  themeColor: "#2f6b3d",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Default to the light palette; only go dark when the user has explicitly chosen it.
const themeScript = `(function(){try{if(localStorage.getItem('tpsj-theme')==='dark')document.documentElement.classList.add('dark');}catch(e){}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-Hant" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Bitter:ital,wght@0,400;0,500;0,600;0,700;1,400&family=IBM+Plex+Sans+TC:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: static, input-free theme script to avoid a flash of the wrong palette */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
