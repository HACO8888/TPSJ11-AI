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
      // `visualViewport.height` is reported in *visual* CSS pixels, i.e. divided
      // by the pinch-zoom scale. When the page is zoomed (e.g. iOS auto-zooms a
      // small input then fails to reset on blur) this would otherwise collapse
      // `--app-height` to a fraction of the screen and squash the layout. Multiply
      // by `scale` to recover the layout height; it stays correct at scale 1, so
      // the keyboard (which shrinks the viewport without zooming) is still tracked.
      const h = vv ? vv.height * (vv.scale || 1) : window.innerHeight;
      root.style.setProperty("--app-height", `${Math.round(h)}px`);
      // How far the *visible* (visual) viewport has scrolled within the layout
      // viewport. iOS scrolls the layout when the keyboard opens; pinning the app
      // container to this offset keeps it glued to the visible area (composer right
      // above the keyboard) instead of being left at the top with an empty gap.
      root.style.setProperty("--app-top", `${Math.round(vv?.offsetTop ?? 0)}px`);
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
