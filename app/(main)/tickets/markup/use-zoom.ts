"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Point } from "@/lib/markup/shapes";
import { clampZoom, zoomAt } from "@/lib/markup/view";
import { desktopStageHeight } from "./stage-height";

/**
 * How big the screenshot is drawn: fitted to the stage, zoomed with the buttons, Ctrl + wheel or a pinch, and the
 * stage's own height on laptops.
 */
export function useZoom(img: HTMLImageElement | null, mobile: boolean) {
  /** The scrolling box the screenshot sits in. */
  const stage = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(0);
  const [scale, setScale] = useState(0);
  const [stageH, setStageH] = useState(360);
  const pendingScroll = useRef<Point | null>(null);

  // Fit the image into the stage, never larger than it really is. Zoomed views keep their zoom when the window resizes.
  const measureFit = useCallback(() => {
    const el = stage.current;
    if (!el || !img) return;
    // Phones: the editor fills the screen and the stage takes all the height the tools leave.
    // Laptops: the stage takes what the window has left once the title, tools, notices and the Use image row fit, so
    // those buttons are never pushed below the window (a short window, browser zoom, or tools wrapping onto two lines).
    const h = mobile ? el.clientHeight : desktopStageHeight(el);
    if (!h) return;
    const f = Math.min(1, el.clientWidth / img.naturalWidth, h / img.naturalHeight);
    setStageH(h);
    setFit((old) => {
      setScale((s) => (s === 0 || s === old ? f : clampZoom(s, f, img.naturalWidth, window.devicePixelRatio || 1)));
      return f;
    });
  }, [img, mobile]);

  useEffect(() => {
    if (!img) return;
    const el = stage.current;
    // The dialog animates in; measure once it has a size, and again whenever it changes: the stage, the dialog (tools
    // wrapping, a notice appearing) or the window.
    const ro = el ? new ResizeObserver(measureFit) : null;
    if (el) ro?.observe(el);
    const box = el?.closest<HTMLElement>("[data-markup-dialog]");
    if (box) ro?.observe(box);
    window.addEventListener("resize", measureFit);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", measureFit);
    };
  }, [img, measureFit]);

  // After a zoom, scroll so the point under the cursor stays put (see zoomAt).
  useLayoutEffect(() => {
    const el = stage.current;
    const to = pendingScroll.current;
    if (!el || !to) return;
    el.scrollLeft = to.x;
    el.scrollTop = to.y;
    pendingScroll.current = null;
  }, [scale]);

  function zoomTo(target: number, cursor?: Point) {
    const el = stage.current;
    if (!el || !img || !scale) return;
    const next = clampZoom(target, fit, img.naturalWidth, window.devicePixelRatio || 1);
    if (Math.abs(next - scale) < 1e-4) return;
    pendingScroll.current = zoomAt({
      scale,
      next,
      image: { w: img.naturalWidth, h: img.naturalHeight },
      stage: { w: el.clientWidth, h: el.clientHeight },
      scroll: { x: el.scrollLeft, y: el.scrollTop },
      cursor: cursor ?? { x: el.clientWidth / 2, y: el.clientHeight / 2 },
    });
    setScale(next);
  }
  // The wheel listener below is added once; these let it reach the current zoom.
  const zoomRef = useRef(zoomTo);
  const currentScale = useRef(scale);
  useEffect(() => {
    zoomRef.current = zoomTo;
    currentScale.current = scale;
  });

  // Ctrl + wheel (and a laptop pinch, which arrives as Ctrl + wheel) zooms the screenshot, not the page. React's wheel
  // listener is passive and can't stop the page zoom, so this one is added by hand.
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const factor = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.002));
      zoomRef.current(currentScale.current * factor, { x: e.clientX - r.left, y: e.clientY - r.top });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [img]);

  /** Pans the stage: to a scroll position, or by a distance. */
  function scrollStageTo(x: number, y: number) {
    const el = stage.current!;
    el.scrollLeft = x;
    el.scrollTop = y;
  }
  function scrollStageBy(dx: number, dy: number) {
    const el = stage.current!;
    el.scrollLeft += dx;
    el.scrollTop += dy;
  }

  return { stage, fit, scale, setScale, stageH, zoomTo, scrollStageTo, scrollStageBy };
}
