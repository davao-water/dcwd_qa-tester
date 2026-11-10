import type { Point, Shape } from "@/lib/markup/shapes";

/** A note or callout being typed; `index` is the mark being retyped, null for a new one. */
export type TextEdit = { kind: "text" | "callout"; at: Point; tip?: Point; index: number | null; color: string; fontPx: number };

export const hasText = (s: Shape | undefined): s is Extract<Shape, { kind: "text" | "step" | "callout" }> => s?.kind === "text" || s?.kind === "step" || s?.kind === "callout";
