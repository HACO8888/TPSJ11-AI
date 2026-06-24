"use client";

import { useEffect } from "react";

// Replaces the root layout when an error happens above it, so it must render
// its own <html>/<body> and cannot rely on globals.css.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global error]", error);
  }, [error]);

  return (
    <html lang="zh-Hant">
      <body
        style={{
          display: "flex",
          minHeight: "100dvh",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, -apple-system, sans-serif",
          background: "#f1ede0",
          color: "#21281f",
          textAlign: "center",
          padding: "24px",
          margin: 0,
        }}
      >
        <h1 style={{ fontSize: "22px", fontWeight: 600 }}>發生了嚴重錯誤</h1>
        <p style={{ marginTop: "8px", color: "#6c7363", fontSize: "14px" }}>
          請重新整理頁面再試一次。
        </p>
        {error.digest && (
          <p
            style={{
              marginTop: "12px",
              fontFamily: "monospace",
              fontSize: "12px",
              color: "#6c7363",
            }}
          >
            錯誤編號：{error.digest}
          </p>
        )}
        <button
          type="button"
          onClick={reset}
          style={{
            marginTop: "20px",
            height: "40px",
            padding: "0 16px",
            borderRadius: "8px",
            background: "#2f6b3d",
            color: "#fff",
            border: "none",
            cursor: "pointer",
          }}
        >
          重試
        </button>
      </body>
    </html>
  );
}
