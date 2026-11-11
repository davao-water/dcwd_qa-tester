import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ACCENT_SCRIPT, ACCENT_STORAGE_KEY, ACCENTS, DEFAULT_ACCENT, isAccent } from "@/lib/theme";

/** Runs the before-paint script against a fake <html> and localStorage. */
function runScript(stored: string | null, throws = false) {
  const html = { dataset: {} as Record<string, string> };
  const localStorage = {
    getItem: (k: string) => {
      if (throws) throw new Error("blocked");
      return k === ACCENT_STORAGE_KEY ? stored : null;
    },
  };
  new Function("document", "localStorage", ACCENT_SCRIPT)({ documentElement: html }, localStorage);
  return html.dataset.accent;
}

describe("theme", () => {
  it("recognises only the listed accents", () => {
    expect(ACCENTS.map((a) => a.key)).toContain(DEFAULT_ACCENT);
    expect(isAccent("teal")).toBe(true);
    expect(isAccent("hotpink")).toBe(false);
    expect(isAccent(undefined)).toBe(false);
  });

  it("applies a saved accent before paint, and ignores the default, junk and blocked storage", () => {
    expect(runScript("teal")).toBe("teal");
    expect(runScript("indigo")).toBeUndefined();
    expect(runScript("</script><script>alert(1)")).toBeUndefined();
    expect(runScript(null)).toBeUndefined();
    expect(runScript("teal", true)).toBeUndefined();
  });

  it("has a CSS rule for every non-default accent, with the same colour", () => {
    const css = readFileSync(path.join(process.cwd(), "app", "_styles", "colors.css"), "utf8");
    for (const a of ACCENTS) {
      if (a.key === DEFAULT_ACCENT) {
        expect(css).toContain(`--acc-base: ${a.color};`);
        continue;
      }
      expect(css).toContain(`[data-accent="${a.key}"] { --acc-base: ${a.color}; }`);
    }
  });

  it("keeps white button text readable on every accent in light mode (WCAG AA, 4.5:1)", () => {
    const lum = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    for (const a of ACCENTS) expect((1.05 / (lum(a.color) + 0.05)) >= 4.5, a.key).toBe(true);
  });
});
