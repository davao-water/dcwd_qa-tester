"use client";

import { useEffect, useRef, useState } from "react";
import { DEFAULT_MARK_COLOR } from "@/lib/markup/colors";
import { emptyHistory, push, type History } from "@/lib/markup/history";
import {
  clampFont,
  DEFAULT_TEXT_SIZE,
  fontOf,
  isTiny,
  TEXT_SIZES,
  textFontSize,
  type Shape,
  type TextSize,
  type Tool,
} from "@/lib/markup/shapes";
import { hasText, type TextEdit } from "./text-edit";

/**
 * The marks on the screenshot, with Undo, and what is being drawn, moved or typed now: the tool, colour and text size
 * picked, and every change to the marks. `W` is the image's width, which sets the text sizes.
 */
export function useMarks(W: number) {
  const [tool, setTool] = useState<Tool>("box");
  const [color, setColor] = useState<string>(DEFAULT_MARK_COLOR);
  const [textSize, setTextSize] = useState<TextSize>(DEFAULT_TEXT_SIZE);
  const [history, setHistory] = useState<History<Shape>>(emptyHistory);
  const [draft, setDraft] = useState<Shape | null>(null);
  /** A mark being moved or resized, shown in place of the saved one until the drag ends. */
  const [live, setLive] = useState<{ index: number; shape: Shape } | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [edit, setEdit] = useState<TextEdit | null>(null);
  const [text, setText] = useState("");
  const textInput = useRef<HTMLInputElement>(null);

  const present = history.present;
  const presetPx = textFontSize(W, textSize);

  const focusText = () => requestAnimationFrame(() => textInput.current?.focus());
  useEffect(() => {
    if (edit) focusText();
  }, [edit]);

  // ── Changing the marks; each call is one Undo step ──
  const add = (s: Shape) => {
    if (!isTiny(s)) setHistory((h) => push(h, [...h.present, s]));
  };
  const replaceAt = (i: number, s: Shape) => setHistory((h) => push(h, h.present.map((x, j) => (j === i ? s : x))));
  const removeAt = (i: number) => setHistory((h) => push(h, h.present.filter((_, j) => j !== i)));
  const changeHistory = (f: (h: History<Shape>) => History<Shape>) => {
    setSelected(null);
    setLive(null);
    setHistory(f);
  };

  /** The note being typed as a mark, or null while it's empty. */
  const typed = (): Shape | null => {
    if (!edit || !text.trim()) return null;
    const base = { at: edit.at, text: text.trim(), color: edit.color, fontPx: edit.fontPx };
    return edit.kind === "callout" ? { kind: "callout", tip: edit.tip!, ...base } : { kind: "text", ...base };
  };

  /** Puts the note on the image (or retypes the mark). Empty text removes a retyped mark and drops a new one. */
  function commitEdit() {
    if (!edit) return;
    const s = typed();
    if (edit.index !== null) {
      if (s) replaceAt(edit.index, s);
      else removeAt(edit.index);
    } else if (s) add(s);
    setEdit(null);
    setText("");
  }

  function retype(i: number) {
    const s = present[i];
    if (s?.kind !== "text" && s?.kind !== "callout") return;
    setSelected(null);
    setEdit({ kind: s.kind, at: s.at, tip: s.kind === "callout" ? s.tip : undefined, index: i, color: s.color, fontPx: fontOf(s, W) });
    setText(s.text);
  }

  function pickTool(t: Tool) {
    if (edit) commitEdit();
    if (t !== "select") setSelected(null);
    setTool(t);
  }

  function pickColor(c: string) {
    setColor(c);
    if (edit) {
      setEdit({ ...edit, color: c });
      focusText();
    } else if (selected !== null) {
      const s = present[selected];
      if (s && "color" in s) replaceAt(selected, { ...s, color: c });
    }
  }

  /** Text size from a size button. */
  function pickSize(id: TextSize) {
    setTextSize(id);
    applyFont(textFontSize(W, id));
  }

  function applyFont(px: number) {
    if (edit) {
      setEdit({ ...edit, fontPx: clampFont(px) });
      focusText();
    } else if (selected !== null && hasText(present[selected])) {
      replaceAt(selected, { ...present[selected], fontPx: clampFont(px) } as Shape);
    }
  }

  /** [ and ]: the selected or typed text a step smaller or bigger; otherwise the size for the next one. */
  function bumpSize(dir: 1 | -1) {
    const sel = selected !== null ? present[selected] : undefined;
    if (edit) applyFont(edit.fontPx * (dir > 0 ? 1.2 : 1 / 1.2));
    else if (hasText(sel)) applyFont(fontOf(sel, W) * (dir > 0 ? 1.2 : 1 / 1.2));
    else {
      const i = TEXT_SIZES.findIndex((s) => s.id === textSize);
      setTextSize(TEXT_SIZES[Math.min(TEXT_SIZES.length - 1, Math.max(0, i + dir))].id);
    }
  }

  return {
    tool,
    color,
    textSize,
    history,
    setHistory,
    present,
    presetPx,
    draft,
    setDraft,
    live,
    setLive,
    selected,
    setSelected,
    edit,
    setEdit,
    text,
    setText,
    textInput,
    add,
    replaceAt,
    removeAt,
    changeHistory,
    typed,
    commitEdit,
    retype,
    pickTool,
    pickColor,
    pickSize,
    bumpSize,
  };
}

export type Marks = ReturnType<typeof useMarks>;
