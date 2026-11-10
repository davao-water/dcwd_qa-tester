"use client";

import { XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { canRedo, canUndo, emptyHistory, push, redo, undo } from "@/lib/markup/history";
import { fontOf, TEXT_SIZES, textFontSize, type Shape } from "@/lib/markup/shapes";
import { clampZoom, ZOOM_STEP } from "@/lib/markup/view";
import { cn } from "@/lib/utils";
import { drawStage } from "./draw-stage";
import { editorKeys } from "./editor-keys";
import { exportImage } from "./export-image";
import { LeaveNotice } from "./leave-notice";
import { MarkupToolbar } from "./markup-toolbar";
import { TextBox } from "./text-box";
import { hasText } from "./text-edit";
import { useMarks } from "./use-marks";
import { usePointer } from "./use-pointer";
import { useZoom } from "./use-zoom";

// The screenshot markup editor (Phase 3.8). Every image added to a ticket or reply opens here before it uploads, so a
// tester can point at the problem and hide customer data first. Only the marked-up copy is uploaded; Hide replaces the
// pixels with solid black in that copy, so the hidden data never leaves the PC.

export type MarkupResult = { action: "use"; file: File } | { action: "original" } | { action: "remove" };

export function MarkupEditor({
  file,
  position,
  isEdit = false,
  onDone,
}: {
  file: File | null;
  position: { index: number; total: number } | null;
  /** Re-opening an image already added: leaving keeps it as it was. A new image is left out instead. */
  isEdit?: boolean;
  onDone: (r: MarkupResult) => void;
}) {
  const mobile = useIsMobile();
  /** The image the "Leave?" question was asked for; a new image in the run starts without it. */
  const [leavingFor, setLeavingFor] = useState<File | null>(null);
  const leaving = !!file && leavingFor === file;
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);

  const W = img?.naturalWidth ?? 1;
  const marks = useMarks(W);
  const { tool, color, textSize, history, present, draft, live, selected, edit, text } = marks;
  const { stage, fit, scale, setScale, stageH, zoomTo, scrollStageTo, scrollStageBy } = useZoom(img, mobile);
  const pointer = usePointer({ marks, img, W, scale, zoomTo, scrollStageTo, scrollStageBy, saving, spaceHeld, stage, canvas });

  // A new image starts a clean editor.
  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      setImg(image);
      marks.setHistory(emptyHistory());
      marks.setDraft(null);
      marks.setLive(null);
      marks.setSelected(null);
      marks.setEdit(null);
      marks.setText("");
      setScale(0);
      setError(null);
      setSaving(false);
      pointer.resetTouches();
    };
    image.onerror = () => setError("This image couldn't be opened. Use the original, or remove it.");
    image.src = url;
    return () => URL.revokeObjectURL(url);
    // Only a new file starts over; the setters and resetTouches do the same on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  /** What's on screen: the saved marks with a drag in progress applied, without the one being retyped, plus a draft. */
  const shown = (): Shape[] => {
    const list = present.map((s, i) => (live && live.index === i ? live.shape : s)).filter((_, i) => !(edit && edit.index === i));
    return draft ? [...list, draft] : list;
  };

  // Redraw whenever the image, the zoom, the marks or the selection change.
  useEffect(() => {
    const c = canvas.current;
    if (!c || !img || !scale) return;
    const sel = selected !== null && edit?.index !== selected ? (live?.index === selected ? live.shape : present[selected]) : undefined;
    drawStage(c, img, scale, shown(), sel);
    // shown() reads the same state as the dependencies below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [img, scale, history, draft, live, selected, edit]);

  async function saveImage() {
    if (!img || !file) return;
    // Read the typed note directly: committing it only updates history on the next render.
    const t = marks.typed();
    let shapes = present;
    if (edit?.index != null) shapes = t ? present.map((s, j) => (j === edit.index ? t : s)) : present.filter((_, j) => j !== edit.index);
    else if (t) shapes = [...present, t];
    if (edit) marks.commitEdit();
    marks.setSelected(null);
    setSaving(true);
    setError(null);
    try {
      // Nothing drawn: the original goes as it is, with its own name.
      if (!shapes.length) return onDone({ action: "original" });
      onDone({ action: "use", file: await exportImage(img, shapes, file.name) });
    } catch (e) {
      setError(e instanceof Error ? e.message : "The image couldn't be saved.");
      setSaving(false);
    }
  }

  const onKeyDown = editorKeys({ marks, scale, fit, zoomTo, saveImage, setSpaceHeld, setHelp });

  const open = file !== null;
  const busy = !!draft || !!edit || !!live;

  /** Leaving never uploads an unmarked copy: an edited image stays as it was, a new one isn't added. */
  const leave = () => onDone(isEdit ? { action: "original" } : { action: "remove" });
  /** The corner X asks first when something would be lost: a new image, or marks drawn on this one. */
  const askLeave = () => (!isEdit || present.length || busy ? setLeavingFor(file) : leave());
  const sel = selected !== null ? present[selected] : undefined;
  const textFor = edit ? edit.fontPx : hasText(sel) ? fontOf(sel, W) : null;
  const sizeShown = textFor === null ? textSize : (TEXT_SIZES.find((s) => textFontSize(W, s.id) === textFor)?.id ?? null);
  const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;

  return (
    <Dialog
      open={open}
      onOpenChange={(next, details) => {
        if (next) return;
        // Esc first cancels what is being drawn or typed, then the selection; Esc and a click outside never throw the
        // markup away.
        if (details.reason === "escape-key" || details.reason === "outside-press") {
          if (busy) {
            marks.setDraft(null);
            marks.setLive(null);
            marks.setEdit(null);
            marks.setText("");
            pointer.dropDrag();
          } else marks.setSelected(null);
          details.cancel();
          return;
        }
        onDone({ action: "remove" });
      }}
    >
      {open ? (
        // Our own corner X (not the dialog's), so leaving asks first instead of silently dropping the image.
        <DialogContent
          data-markup-dialog=""
          // Laptops: never taller than the window. The stage is sized to fit (desktopStageHeight); if the window is too
          // short even for that, the dialog scrolls rather than hiding Use image.
          className="sm:max-w-[73.75rem] md:max-h-[calc(100dvh-1rem)] md:overflow-y-auto md:overscroll-contain max-md:inset-0 max-md:flex max-md:h-dvh max-md:max-h-none max-md:max-w-none max-md:flex-col max-md:gap-2 max-md:overflow-hidden max-md:rounded-none max-md:px-3 max-md:pt-[calc(0.75rem+env(safe-area-inset-top))] max-md:pb-[calc(0.75rem+env(safe-area-inset-bottom))] max-md:short:grid max-md:short:grid-cols-[minmax(0,1fr)_17rem] max-md:short:grid-rows-[auto_minmax(0,1fr)_auto_auto]"
          showGrabber={false}
          showCloseButton={false}
          onKeyDown={onKeyDown} onKeyUp={(e) => e.key === " " && setSpaceHeld(false)}>
          <button
            type="button"
            onClick={askLeave}
            disabled={saving}
            aria-label="Leave without saving"
            title="Leave without saving"
            className="absolute top-3 right-3 z-10 flex size-9 cursor-pointer items-center justify-center rounded-lg text-muted-foreground hover:bg-surface3 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 max-md:top-[calc(0.5rem+env(safe-area-inset-top))] max-md:right-2"
          >
            <XIcon className="size-5" aria-hidden />
          </button>
          <DialogHeader className="pr-10 max-md:shrink-0 max-md:short:col-start-2">
            <DialogTitle className="truncate font-mono text-[1.125rem] max-md:text-[1.0625rem]" title={file.name}>
              {file.name}
            </DialogTitle>
            <DialogDescription className="max-md:text-[0.8125rem] max-md:short:hidden">
              {position && position.total > 1 ? `${position.index} of ${position.total} · ` : ""}
              <span className="max-md:hidden">Mark up this screenshot: point at the problem, and hide names, account numbers and amounts before it uploads.</span>
              <span className="md:hidden">Hide names, account numbers and amounts.</span>
            </DialogDescription>
          </DialogHeader>

          <MarkupToolbar
            className="max-md:order-2 max-md:shrink-0 max-md:short:col-start-2 max-md:short:row-start-2 max-md:short:content-start max-md:short:overflow-y-auto"
            tool={tool}
            onTool={marks.pickTool}
            color={edit?.color ?? (sel && "color" in sel ? sel.color : color)}
            onColor={marks.pickColor}
            showSize={tool === "text" || tool === "step" || tool === "callout" || !!edit || hasText(sel)}
            textSize={sizeShown}
            onTextSize={marks.pickSize}
            canUndo={canUndo(history)}
            canRedo={canRedo(history)}
            onUndo={() => marks.changeHistory(undo)}
            onRedo={() => marks.changeHistory(redo)}
            canClear={!!present.length}
            onClear={() => marks.changeHistory((h) => push(h, []))}
            zoomPercent={Math.round(scale * 100)}
            canZoomIn={!!img && clampZoom(scale * ZOOM_STEP, fit, W, dpr) > scale + 1e-4}
            canZoomOut={scale > fit + 1e-4}
            onZoomIn={() => zoomTo(scale * ZOOM_STEP)}
            onZoomOut={() => zoomTo(scale / ZOOM_STEP)}
            onFit={() => zoomTo(fit)}
            help={help}
            onHelp={() => setHelp((h) => !h)}
          />

          <div
            ref={stage}
            className="relative flex touch-none overflow-auto rounded-lg bg-sample-black max-md:order-1 max-md:min-h-0 max-md:flex-1 max-md:short:col-start-1 max-md:short:row-span-4 max-md:short:row-start-1"
            style={mobile ? undefined : { height: stageH }}
            {...pointer.stageHandlers}
          >
            {img && scale ? (
              <div className="relative m-auto shrink-0" style={{ width: img.naturalWidth * scale, height: img.naturalHeight * scale }}>
                <canvas
                  ref={canvas}
                  aria-label="Screenshot being marked up"
                  className={cn(
                    "block touch-none",
                    spaceHeld ? "cursor-grab active:cursor-grabbing" : tool === "select" ? "cursor-default" : tool === "text" ? "cursor-text" : "cursor-crosshair",
                  )}
                  style={{ width: img.naturalWidth * scale, height: img.naturalHeight * scale }}
                  {...pointer.canvasHandlers}
                  // The click that places a text box would otherwise move focus to the dialog right after the box opens.
                  onMouseDown={(e) => (tool === "text" || tool === "callout") && e.preventDefault()}
                />
                {edit ? <TextBox edit={edit} text={text} onText={marks.setText} scale={scale} inputRef={marks.textInput} onCommit={marks.commitEdit} /> : null}
              </div>
            ) : (
              <p role={error ? "alert" : "status"} className="m-auto p-6 text-sm text-white/70">
                {error ?? "Opening the image…"}
              </p>
            )}
          </div>

          {error && img ? (
            <p role="alert" className="text-[0.7813rem] font-medium text-destructive-text max-md:order-3 max-md:shrink-0 max-md:short:col-start-2 max-md:short:row-start-3">
              {error}
            </p>
          ) : null}

          {leaving ? <LeaveNotice isEdit={isEdit} onStay={() => setLeavingFor(null)} onLeave={leave} /> : null}

          <DialogFooter className="sm:justify-between max-md:order-4 max-md:mx-0 max-md:mb-0 max-md:shrink-0 max-md:flex-row max-md:flex-wrap max-md:items-center max-md:justify-between max-md:border-t-0 max-md:p-0 max-md:pt-1 max-md:short:col-start-2 max-md:short:row-start-4">
            <Button type="button" variant="ghost-red" onClick={() => onDone({ action: "remove" })} disabled={saving}>
              Remove
            </Button>
            <div className="flex gap-2 sm:flex-row">
              <Button type="button" variant="outline" onClick={() => onDone({ action: "original" })} disabled={saving}>
                Use original
              </Button>
              <Button type="button" onClick={saveImage} disabled={saving || !img} title="Use image (Ctrl+Enter)">
                {saving ? "Saving…" : "Use image"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
