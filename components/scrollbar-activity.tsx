"use client";

import { useEffect } from "react";

/** How long a scrollbar stays visible after the last scroll. */
const HIDE_AFTER_MS = 900;

/**
 * Scrollbars are hidden until something scrolls (app/_styles/base.css, "Scrollbars"). This marks whatever is scrolling, the
 * page or a card's own list, with `data-scrolling` while it moves, and clears it shortly after it stops. One listener
 * for the whole app; it renders nothing.
 */
export function ScrollbarActivity() {
  useEffect(() => {
    const timers = new WeakMap<Element, number>();
    const onScroll = (e: Event) => {
      const el = e.target instanceof Element ? e.target : document.documentElement;
      el.setAttribute("data-scrolling", "");
      window.clearTimeout(timers.get(el));
      timers.set(el, window.setTimeout(() => el.removeAttribute("data-scrolling"), HIDE_AFTER_MS));
    };
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => document.removeEventListener("scroll", onScroll, { capture: true });
  }, []);
  return null;
}
