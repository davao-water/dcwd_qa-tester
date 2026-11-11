"use client";

import { ThemeProvider as NextThemes, useTheme } from "next-themes";
import { useCallback, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { ACCENT_STORAGE_KEY, DEFAULT_ACCENT, isAccent, type AccentKey } from "@/lib/theme";

/** Light, dark or follow Windows. Adds the `dark` class to <html>; the choice is remembered per browser. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemes attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange storageKey="qa-hub-theme">
      {children}
    </NextThemes>
  );
}

/** How long the light/dark reveal takes, and its easing (as Magic UI's animated theme toggler: 400 ms by default). */
const REVEAL_MS = 500;
const REVEAL_EASE = "cubic-bezier(0.4, 0, 0.2, 1)";

/**
 * The theme and a setter that reveals the new look in a growing circle, from the button that was pressed (or the middle
 * of the window), like Magic UI's animated theme toggler. It uses the View Transitions API: the browser keeps a picture of
 * the old page and clips the new one in over it (app/_styles/theme-switch.css, `.theme-reveal`). Browsers without it, and people who
 * turn motion off, switch at once. Every theme switch goes through this.
 */
export function useThemeSwitch() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const switchTo = useCallback(
    (next: string, from?: HTMLElement | null) => {
      const root = document.documentElement;
      const dark = next === "dark" || (next === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
      const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      // Nothing to see change (the same look, or "system" resolving to it): just remember the choice.
      if (!document.startViewTransition || still || root.classList.contains("dark") === dark) return setTheme(next);
      root.classList.add("theme-reveal");
      const t = document.startViewTransition(() => {
        // The new look must be on the page before the browser takes its "after" picture, so set the class here rather
        // than wait for next-themes to do it in an effect; it sets the same class afterwards.
        root.classList.toggle("dark", dark);
        root.classList.toggle("light", !dark);
        root.style.colorScheme = dark ? "dark" : "light";
        flushSync(() => setTheme(next));
      });
      // Grow a circle from the centre of the button (or the window) to the farthest corner.
      const box = from?.getBoundingClientRect();
      const x = box ? box.left + box.width / 2 : window.innerWidth / 2;
      const y = box ? box.top + box.height / 2 : window.innerHeight / 2;
      const r = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
      void t.ready
        .then(() =>
          root.animate(
            { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
            { duration: REVEAL_MS, easing: REVEAL_EASE, pseudoElement: "::view-transition-new(root)" },
          ),
        )
        .catch(() => {});
      void t.finished.finally(() => root.classList.remove("theme-reveal"));
    },
    [setTheme],
  );
  return { theme, resolvedTheme, setTheme: switchTo };
}

// The accent lives on <html data-accent="…"> (set before paint by ACCENT_SCRIPT) and in localStorage.
const listeners = new Set<() => void>();

function readAccent(): AccentKey {
  const v = document.documentElement.dataset.accent;
  return isAccent(v) ? v : DEFAULT_ACCENT;
}

export function setAccent(key: AccentKey) {
  if (key === DEFAULT_ACCENT) delete document.documentElement.dataset.accent;
  else document.documentElement.dataset.accent = key;
  try {
    localStorage.setItem(ACCENT_STORAGE_KEY, key);
  } catch {
    // Private windows can refuse storage; the colour still applies until the page is reloaded.
  }
  listeners.forEach((l) => l());
}

export function useAccent(): AccentKey {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    readAccent,
    () => DEFAULT_ACCENT,
  );
}
