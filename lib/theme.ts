// Appearance: light/dark mode (next-themes, stored per browser) and the accent colour every page derives its
// highlights from (--acc in app/_styles/colors.css). Each accent keeps white button text readable (WCAG AA) in light mode;
// dark mode lightens it automatically.

export const ACCENTS = [
  { key: "indigo", label: "DCWD indigo", color: "#4f56d3" },
  { key: "blue", label: "Ocean blue", color: "#1d64d8" },
  { key: "teal", label: "Teal", color: "#0f7c7e" },
  { key: "green", label: "Green", color: "#18794e" },
  { key: "violet", label: "Violet", color: "#7445c9" },
  { key: "rose", label: "Rose", color: "#c0365a" },
] as const;

export type AccentKey = (typeof ACCENTS)[number]["key"];
export const DEFAULT_ACCENT: AccentKey = "indigo";
export const ACCENT_STORAGE_KEY = "qa-hub-accent";

export function isAccent(v: unknown): v is AccentKey {
  return typeof v === "string" && ACCENTS.some((a) => a.key === v);
}

/**
 * Runs in <head> before the page paints, so the saved accent is applied without a flash of the default colour.
 * Anything unexpected in storage falls back to the default.
 */
export const ACCENT_SCRIPT = `(function(){try{var k=${JSON.stringify(ACCENTS.map((a) => a.key))};var v=localStorage.getItem(${JSON.stringify(ACCENT_STORAGE_KEY)});if(k.indexOf(v)>-1&&v!==${JSON.stringify(DEFAULT_ACCENT)})document.documentElement.dataset.accent=v;}catch(e){}})();`;
