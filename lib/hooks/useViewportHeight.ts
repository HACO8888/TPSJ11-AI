"use client";

import { useEffect } from "react";

/**
 * Pins a `--app-height` CSS variable to the *actually visible* viewport height.
 *
 * In-app browsers (Facebook / Instagram / LINE) are notorious for mis-reporting
 * CSS viewport units: `100vh`/`100dvh`/`100svh` can resolve taller than the area
 * the user can actually see, which pushes a bottom-pinned composer down behind
 * the in-app browser's toolbar — unreachable, no send button visible.
 *
 * `visualViewport.height` (falling back to `window.innerHeight`) reports the real
 * visible height in those WebViews, and also shrinks when the on-screen keyboard
 * opens, keeping the composer above it. We re-measure on every event that can
 * change the visible area: viewport resize/scroll (toolbars sliding in/out) and
 * orientation changes.
 */
export function useViewportHeight() {
  useEffect(() => {
    const root = document.documentElement;
    const vv = window.visualViewport;

    function set() {
      const h = vv?.height ?? window.innerHeight;
      root.style.setProperty("--app-height", `${Math.round(h)}px`);
    }

    set();
    vv?.addEventListener("resize", set);
    vv?.addEventListener("scroll", set);
    window.addEventListener("resize", set);
    window.addEventListener("orientationchange", set);

    return () => {
      vv?.removeEventListener("resize", set);
      vv?.removeEventListener("scroll", set);
      window.removeEventListener("resize", set);
      window.removeEventListener("orientationchange", set);
    };
  }, []);
}
