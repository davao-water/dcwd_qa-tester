"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon, ZoomInIcon, ZoomOutIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatBytes } from "@/lib/format";
import { clampViewerZoom, stepZoom, ZOOM_MAX } from "@/lib/markup/view";
import { cn } from "@/lib/utils";

// One image gallery for the whole ticket: the description's screenshots, then each reply's, oldest first. A thumbnail
// opens the viewer at that image; the arrow buttons or the ← → keys move through all of them, Esc closes. The − / + buttons,
// the + − 0 keys (with or without Ctrl) and Ctrl + mouse wheel zoom; once zoomed, drag with the mouse or a finger to look around.

export type GalleryImage = { id: string; originalName: string; size: number };

const GalleryContext = createContext<(id: string) => void>(() => {});

export function ImageGallery({ images, children }: { images: GalleryImage[]; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  // Kept while closing, so the dialog can animate out with its image still in it.
  const [index, setIndex] = useState(0);
  // Kept with the image it's for: any other image starts at 100 %, including when a refresh swaps the one on screen.
  const [zoomState, setZoomState] = useState({ id: "", zoom: 1 });
  /** The image's width on screen at 100 %, which zooming multiplies. */
  const [fitWidth, setFitWidth] = useState(0);
  const view = useRef<HTMLDivElement | null>(null);
  const image = useRef<HTMLImageElement>(null);
  /** The spot to keep in place through a zoom: as a fraction of the image, and where it is in the view. */
  const anchor = useRef<{ fx: number; fy: number; x: number; y: number } | null>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  // A refresh can remove an image while the viewer is open; stay within the list.
  const at = Math.min(index, images.length - 1);
  const current = images[at];
  const zoom = zoomState.id === current?.id ? zoomState.zoom : 1;
  const hasPrev = at > 0;
  const hasNext = at < images.length - 1;
  const moveTo = (i: number) => {
    setIndex(i);
    setZoomState({ id: "", zoom: 1 });
  };
  const prev = () => hasPrev && moveTo(at - 1);
  const next = () => hasNext && moveTo(at + 1);

  function show(id: string) {
    const i = images.findIndex((img) => img.id === id);
    if (i === -1) return;
    moveTo(i);
    setOpen(true);
  }

  /** Zooms keeping the point under `cursor` (in the view's coordinates) still; without one, the middle of the view. */
  function zoomTo(wanted: number, cursor?: { x: number; y: number }) {
    const v = view.current;
    const i = image.current;
    const nextZoom = clampViewerZoom(wanted);
    // Not until the image has arrived: until then it has no size to zoom from.
    if (!v || !i || !i.naturalWidth || !current || nextZoom === zoom) return;
    const box = i.getBoundingClientRect();
    if (zoom === 1) setFitWidth(box.width);
    const frame = v.getBoundingClientRect();
    const spot = cursor ?? { x: frame.width / 2, y: frame.height / 2 };
    anchor.current = { fx: (frame.left + spot.x - box.left) / box.width, fy: (frame.top + spot.y - box.top) / box.height, x: spot.x, y: spot.y };
    setZoomState({ id: current.id, zoom: nextZoom });
  }

  useLayoutEffect(() => {
    const a = anchor.current;
    const v = view.current;
    const i = image.current;
    anchor.current = null;
    if (!a || !v || !i) return;
    const frame = v.getBoundingClientRect();
    const box = i.getBoundingClientRect();
    v.scrollLeft += box.left - frame.left + a.fx * box.width - a.x;
    v.scrollTop += box.top - frame.top + a.fy * box.height - a.y;
  }, [zoom]);

  // Ctrl + wheel (and a laptop pinch, which arrives as Ctrl + wheel) zooms the image, not the page. React's wheel listener
  // is passive and can't stop the page zoom, so this one is added by hand, as in the markup editor.
  const wheelZoom = useRef<(e: WheelEvent) => void>(() => {});
  useEffect(() => {
    wheelZoom.current = (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const r = view.current?.getBoundingClientRect();
      if (!r) return;
      zoomTo(zoom * Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.002)), { x: e.clientX - r.left, y: e.clientY - r.top });
    };
  });
  const attachView = useCallback((el: HTMLDivElement | null) => {
    view.current = el;
    if (!el) return;
    const onWheel = (e: WheelEvent) => wheelZoom.current(e);
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const zoomed = zoom > 1;

  return (
    <GalleryContext.Provider value={show}>
      {children}
      <Dialog open={open && !!current} onOpenChange={setOpen}>
        {current ? (
          <DialogContent
            className="sm:max-w-5xl"
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft") {
                e.preventDefault();
                prev();
              } else if (e.key === "ArrowRight") {
                e.preventDefault();
                next();
              } else if (!e.altKey && (e.key === "+" || e.key === "=")) {
                e.preventDefault();
                zoomTo(stepZoom(zoom, 1));
              } else if (!e.altKey && (e.key === "-" || e.key === "_")) {
                e.preventDefault();
                zoomTo(stepZoom(zoom, -1));
              } else if (!e.altKey && e.key === "0") {
                e.preventDefault();
                zoomTo(1);
              }
            }}
          >
            <DialogHeader>
              <DialogTitle className="truncate" title={current.originalName}>
                {current.originalName}
              </DialogTitle>
              <DialogDescription>
                {at + 1} / {images.length} · {formatBytes(current.size)}
              </DialogDescription>
            </DialogHeader>
            <div
              ref={attachView}
              className={cn("flex max-h-[70vh] min-h-48 rounded-lg border border-line bg-black", zoomed ? "cursor-grab overflow-auto active:cursor-grabbing" : "overflow-hidden")}
              onPointerDown={(e) => {
                // A finger already scrolls this box by itself.
                if (!zoomed || e.pointerType !== "mouse" || e.button !== 0) return;
                // A press on the box's own scrollbars is theirs.
                const box = e.currentTarget.getBoundingClientRect();
                if (e.clientX - box.left >= e.currentTarget.clientWidth || e.clientY - box.top >= e.currentTarget.clientHeight) return;
                e.currentTarget.setPointerCapture(e.pointerId);
                drag.current = { x: e.clientX, y: e.clientY, left: e.currentTarget.scrollLeft, top: e.currentTarget.scrollTop };
              }}
              onPointerMove={(e) => {
                const d = drag.current;
                if (!d) return;
                // Esc or an arrow key mid-drag can end it with no button-up reaching here.
                if (!(e.buttons & 1)) {
                  drag.current = null;
                  return;
                }
                e.currentTarget.scrollLeft = d.left - (e.clientX - d.x);
                e.currentTarget.scrollTop = d.top - (e.clientY - d.y);
              }}
              onPointerUp={() => (drag.current = null)}
              onPointerCancel={() => (drag.current = null)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- served by the auth-checked /files route, not next/image */}
              <img
                key={current.id}
                ref={image}
                src={`/files/${current.id}`}
                alt={current.originalName}
                draggable={false}
                // Auto margins centre it while it fits, and unlike centring the box, can't cut off its left side once it's larger.
                className={cn("m-auto", zoomed ? "h-auto max-w-none shrink-0" : "max-h-[70vh] w-auto max-w-full object-contain")}
                style={zoomed ? { width: fitWidth * zoom } : undefined}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              {/* Focusable while disabled: at the first or last image the button stays focused, so the keys keep working. */}
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Previous image" disabled={!hasPrev} focusableWhenDisabled onClick={prev}>
                <ChevronLeftIcon />
              </Button>
              <div className="flex min-w-0 flex-wrap items-center justify-center gap-x-3 gap-y-1">
                <div className="flex items-center gap-1">
                  <Button type="button" variant="ghost" size="icon-sm" aria-label="Zoom out" title="Zoom out (−)" disabled={!zoomed} focusableWhenDisabled onClick={() => zoomTo(stepZoom(zoom, -1))}>
                    <ZoomOutIcon />
                  </Button>
                  <Button type="button" variant="ghost" size="sm" className="min-w-14 tabular-nums" aria-label={`Zoom ${Math.round(zoom * 100)} percent. Reset to 100 percent`} title="Reset zoom (0)" onClick={() => zoomTo(1)}>
                    {Math.round(zoom * 100)}%
                  </Button>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label="Zoom in" title="Zoom in (+)" disabled={zoom >= ZOOM_MAX} focusableWhenDisabled onClick={() => zoomTo(stepZoom(zoom, 1))}>
                    <ZoomInIcon />
                  </Button>
                </div>
                <span className="text-[0.75rem] text-muted-foreground max-md:hidden">+ − zoom · 0 reset · Ctrl + wheel · drag to move</span>
                <a href={`/files/${current.id}`} target="_blank" rel="noopener" className="text-[0.8125rem] text-muted-foreground hover:text-primary-text">
                  Open full size
                </a>
              </div>
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Next image" disabled={!hasNext} focusableWhenDisabled onClick={next}>
                <ChevronRightIcon />
              </Button>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </GalleryContext.Provider>
  );
}

/** A thumbnail that opens the ticket's gallery at this image. Its caption ("name · size") is its name for screen readers. */
export function ImageThumb({ file, className }: { file: GalleryImage; className?: string }) {
  const show = useContext(GalleryContext);
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      onClick={() => show(file.id)}
      className={cn("group block w-44 cursor-pointer overflow-hidden rounded-lg border border-line bg-surface2 text-left hover:border-acc-b focus-visible:ring-3 focus-visible:ring-acc/30 focus-visible:outline-none", className)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- served by the auth-checked /files route, not next/image */}
      <img src={`/files/${file.id}`} alt="" loading="lazy" className="h-28 w-full object-cover" />
      <span className="block truncate px-2 py-1 text-[0.7188rem] text-muted-foreground group-hover:text-primary-text" title={file.originalName}>
        {file.originalName} · {formatBytes(file.size)}
      </span>
    </button>
  );
}
