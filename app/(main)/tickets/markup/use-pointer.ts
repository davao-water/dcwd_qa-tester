"use client";

import { useRef, type RefObject } from "react";
import { canvasMeasure } from "@/lib/markup/draw";
import { handleAt, hitTest, move, resize, type Handle, type Measure } from "@/lib/markup/geometry";
import { nextStep, normalizeRect, type Point, type Shape } from "@/lib/markup/shapes";
import { pinchZoom } from "@/lib/markup/view";
import type { Marks } from "./use-marks";

type Drag =
  | { mode: "draw"; from: Point }
  | { mode: "callout"; tip: Point }
  | { mode: "move"; index: number; from: Point; start: Shape }
  | { mode: "resize"; index: number; handle: Handle; start: Shape }
  | { mode: "pan"; client: Point; scroll: Point }
  // A finger on a tool that acts on one tap: it waits for the lift, in case this is the start of a pinch.
  | { mode: "tap"; at: Point };

/** Two fingers on the screenshot: where they started, and how far apart. */
type Pinch = { distance: number; scale: number; middle: Point };

const middleOf = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** How close a click must be to a line or a handle, in screen pixels. */
const GRAB_PX = 8;

/**
 * Drawing with the mouse, a pen or a finger: draw, move, resize and pan on the canvas, and pinch to zoom with two
 * fingers on the stage.
 */
export function usePointer({
  marks,
  img,
  W,
  scale,
  zoomTo,
  scrollStageTo,
  scrollStageBy,
  saving,
  spaceHeld,
  stage,
  canvas,
}: {
  marks: Marks;
  img: HTMLImageElement | null;
  W: number;
  scale: number;
  zoomTo: (target: number, cursor?: Point) => void;
  scrollStageTo: (x: number, y: number) => void;
  scrollStageBy: (dx: number, dy: number) => void;
  saving: boolean;
  spaceHeld: boolean;
  stage: RefObject<HTMLDivElement | null>;
  canvas: RefObject<HTMLCanvasElement | null>;
}) {
  const { tool, color, present, presetPx, draft, setDraft, live, setLive, selected, setSelected, edit, setEdit, setText } = marks;
  const { add, replaceAt, commitEdit, retype } = marks;
  const drag = useRef<Drag | null>(null);
  /** Fingers on the screenshot now, by pointer id. */
  const fingers = useRef(new Map<number, Point>());
  const pinch = useRef<Pinch | null>(null);
  const measureRef = useRef<Measure | null>(null);
  const measure: Measure = (t, px) => (measureRef.current ??= canvasMeasure(document.createElement("canvas").getContext("2d")!))(t, px);

  const toImage = (e: { clientX: number; clientY: number }): Point => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
  };

  // Fingers are followed on the stage, before the canvas sees them, so a pinch also works with a finger on the black
  // bars beside a tall screenshot. A second finger drops whatever the first had started; until both lift it's zoom and move.
  function onFingerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType !== "touch") return;
    fingers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (fingers.current.size !== 2) return;
    const [a, b] = [...fingers.current.values()];
    drag.current = null;
    setDraft(null);
    setLive(null);
    pinch.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), scale, middle: middleOf(a, b) };
  }

  function onFingerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (fingers.current.has(e.pointerId)) fingers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current) {
      movePinch(pinch.current);
      e.stopPropagation();
    }
  }

  function onFingerUp(e: React.PointerEvent<HTMLDivElement>) {
    fingers.current.delete(e.pointerId);
    if (!pinch.current) return;
    if (!fingers.current.size) pinch.current = null;
    e.stopPropagation();
  }

  function movePinch(p: Pinch) {
    const [a, b] = [...fingers.current.values()];
    if (!a || !b) return;
    const el = stage.current!;
    const middle = middleOf(a, b);
    scrollStageBy(-(middle.x - p.middle.x), -(middle.y - p.middle.y));
    p.middle = middle;
    const r = el.getBoundingClientRect();
    zoomTo(pinchZoom(p.scale, p.distance, Math.hypot(a.x - b.x, a.y - b.y)), { x: middle.x - r.left, y: middle.y - r.top });
  }

  function placeText(p: Point, tol: number) {
    const i = hitTest(present, p, W, tol, measure);
    if (i >= 0 && present[i].kind === "text") retype(i);
    else setEdit({ kind: "text", at: p, index: null, color, fontPx: presetPx });
    setText("");
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!img || saving || pinch.current) return;
    const el = stage.current!;
    if (e.button === 1 || (e.button === 0 && spaceHeld)) {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      drag.current = { mode: "pan", client: { x: e.clientX, y: e.clientY }, scroll: { x: el.scrollLeft, y: el.scrollTop } };
      return;
    }
    if (e.button !== 0) return;
    const p = toImage(e);
    const tol = GRAB_PX / scale;
    if (edit) commitEdit();

    if (tool === "select") {
      const sel = selected !== null ? present[selected] : undefined;
      const handle = sel ? handleAt(sel, p, W, tol, measure) : null;
      if (sel && handle) {
        drag.current = { mode: "resize", index: selected!, handle, start: sel };
      } else {
        const i = hitTest(present, p, W, tol, measure);
        setSelected(i >= 0 ? i : null);
        if (i >= 0) drag.current = { mode: "move", index: i, from: p, start: present[i] };
      }
      if (drag.current) e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }
    if ((tool === "text" || tool === "step") && e.pointerType === "touch") {
      e.currentTarget.setPointerCapture(e.pointerId);
      drag.current = { mode: "tap", at: p };
      return;
    }
    if (tool === "text") {
      e.preventDefault();
      placeText(p, tol);
      return;
    }
    if (tool === "step") {
      add({ kind: "step", at: p, n: nextStep(present), color, fontPx: presetPx });
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    if (tool === "callout") {
      drag.current = { mode: "callout", tip: p };
      return;
    }
    drag.current = { mode: "draw", from: p };
    setDraft(tool === "pen" ? { kind: "pen", points: [p], color } : null);
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const d = drag.current;
    if (!d || d.mode === "tap") return;
    if (d.mode === "pan") {
      scrollStageTo(d.scroll.x - (e.clientX - d.client.x), d.scroll.y - (e.clientY - d.client.y));
      return;
    }
    const p = toImage(e);
    if (d.mode === "move") setLive({ index: d.index, shape: move(d.start, p.x - d.from.x, p.y - d.from.y) });
    else if (d.mode === "resize") setLive({ index: d.index, shape: resize(d.start, d.handle, p, W, measure) });
    else if (d.mode === "callout") setDraft({ kind: "arrow", from: p, to: d.tip, color });
    else if (tool === "pen") setDraft((s) => (s?.kind === "pen" ? { ...s, points: [...s.points, p] } : s));
    else if (tool === "arrow") setDraft({ kind: "arrow", from: d.from, to: p, color });
    else if (tool === "box" || tool === "ellipse") setDraft({ kind: tool, rect: normalizeRect(d.from, p), color });
    else if (tool === "highlight" || tool === "hide" || tool === "crop") setDraft({ kind: tool, rect: normalizeRect(d.from, p) });
  }

  function onPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    const d = drag.current;
    drag.current = null;
    if (!d || d.mode === "pan") return;
    // The system took the touch away (a call, a gesture): nothing half-done is kept.
    if (e.type === "pointercancel") {
      setDraft(null);
      setLive(null);
      return;
    }
    if (d.mode === "tap") {
      if (tool === "text") placeText(d.at, GRAB_PX / scale);
      else add({ kind: "step", at: d.at, n: nextStep(present), color, fontPx: presetPx });
      return;
    }
    if (d.mode === "move" || d.mode === "resize") {
      if (live) replaceAt(d.index, live.shape);
      setLive(null);
      return;
    }
    if (d.mode === "callout") {
      setDraft(null);
      const p = toImage(e);
      // A click without a drag puts the note a little below and to the right of the point.
      const at = Math.hypot(p.x - d.tip.x, p.y - d.tip.y) > 12 / scale ? p : { x: d.tip.x + presetPx * 2, y: d.tip.y + presetPx * 1.5 };
      setEdit({ kind: "callout", tip: d.tip, at, index: null, color, fontPx: presetPx });
      setText("");
      return;
    }
    if (draft) add(draft);
    setDraft(null);
  }

  function onDoubleClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (tool !== "select" || !img) return;
    const i = hitTest(present, toImage(e), W, GRAB_PX / scale, measure);
    if (i >= 0) retype(i);
  }

  /** A new image: no finger or pinch carries over. */
  const resetTouches = () => {
    fingers.current.clear();
    pinch.current = null;
  };
  /** Esc: forget the drag in progress. */
  const dropDrag = () => {
    drag.current = null;
  };

  return {
    stageHandlers: {
      onPointerDownCapture: onFingerDown,
      onPointerMoveCapture: onFingerMove,
      onPointerUpCapture: onFingerUp,
      onPointerCancelCapture: onFingerUp,
    },
    canvasHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
      onDoubleClick,
    },
    resetTouches,
    dropDrag,
  };
}
