"use client";

import { ON_MARK, TEXT_OUTLINE } from "@/lib/markup/colors";
import { FONT } from "@/lib/markup/draw";
import { LINE } from "@/lib/markup/geometry";
import { cn } from "@/lib/utils";
import type { TextEdit } from "./text-edit";

/**
 * The box you type a note or callout into, sitting exactly where it will be drawn, in its colour and size. It's placed
 * on Enter, a click elsewhere, another tool or Use image, never on blur: the dialog moves focus around on clicks.
 */
export function TextBox({ edit, text, onText, scale, inputRef, onCommit }: { edit: TextEdit; text: string; onText: (t: string) => void; scale: number; inputRef: React.RefObject<HTMLInputElement | null>; onCommit: () => void }) {
  const px = edit.fontPx * scale;
  const callout = edit.kind === "callout";
  const pad = callout ? edit.fontPx * 0.45 * scale : 0;
  return (
    <input
      ref={inputRef}
      value={text}
      onChange={(e) => onText(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onCommit();
        }
      }}
      aria-label={callout ? "Callout text" : "Text to add"}
      placeholder="Type, then Enter"
      maxLength={200}
      className={cn("absolute rounded-sm border border-dashed border-acc font-semibold outline-none placeholder:font-normal", callout ? "placeholder:text-white/80" : "bg-black/25 placeholder:text-white/70")}
      style={{
        left: edit.at.x * scale,
        top: edit.at.y * scale - 1,
        padding: pad,
        font: FONT(Math.max(16, px)),
        lineHeight: LINE,
        color: callout ? ON_MARK : edit.color,
        backgroundColor: callout ? edit.color : undefined,
        width: `${Math.max(text.length, 14) + 1}ch`,
        textShadow: callout ? undefined : `0 0 2px ${TEXT_OUTLINE}, 0 0 2px ${TEXT_OUTLINE}`,
      }}
    />
  );
}
