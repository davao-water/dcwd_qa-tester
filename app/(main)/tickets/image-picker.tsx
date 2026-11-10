"use client";

import { Button } from "@/components/ui/button";
import { useTouchScreen } from "@/hooks/use-touch-screen";
import { formatBytes } from "@/lib/format";
import { IMAGE_MAX_BYTES, IMAGE_TYPES, MAX_IMAGES_PER_POST } from "@/lib/uploads/limits";
import { cn } from "@/lib/utils";
import { CameraIcon, ImageIcon, ImagePlusIcon, MonitorIcon, PencilIcon, RotateCwIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useCanCapture } from "./_images/capture";
import type { ImageAttachments } from "./_images/use-image-attachments";
import { MarkupEditor } from "./markup/markup-editor";

// Images for a ticket or comment: what is attached, with Edit, Retry and Remove, and the ways to add more. The work
// (markup, upload, retry) is in _images/use-image-attachments.ts.

/** The id of the hidden camera input for the picker with this `id`. */
export const cameraInputId = (id: string) => `${id}-camera`;

/** `compact`: the reply box, where the Attach menu (attach-menu.tsx) opens these inputs and only what's attached shows here. */
export function ImagePicker({ state, id = "images", compact }: { state: ImageAttachments; id?: string; compact?: boolean }) {
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const canCapture = useCanCapture();
  const touch = useTouchScreen();
  const full = state.items.length >= MAX_IMAGES_PER_POST;

  // Ctrl+V anywhere on the page that isn't a text field lands here too, so a fresh Win+Shift+S can be pasted without
  // clicking first. Pastes into a field (or already handled, e.g. by this box) are left alone.
  const latestPaste = useRef(state.onPaste);
  useEffect(() => {
    latestPaste.current = state.onPaste;
  });
  useEffect(() => {
    const paste = (e: ClipboardEvent) => {
      // On a ticket's Details tab the reply box is hidden, and the image must not land somewhere nobody can see it.
      if (!inputRef.current?.getClientRects().length) return;
      const el = document.activeElement as HTMLElement | null;
      if (e.defaultPrevented || el?.closest("input, textarea, select, [contenteditable=''], [contenteditable='true'], [role='dialog']")) return;
      latestPaste.current(e);
    };
    document.addEventListener("paste", paste);
    return () => document.removeEventListener("paste", paste);
  }, []);

  return (
    <div
      {...(compact
        ? // The box around it (the reply form, or the New ticket upload box) takes the paste and the drop.
          { className: "contents" }
        : {
            // Focusable, so clicking it and pressing Ctrl+V pastes here.
            tabIndex: 0,
            role: "group",
            "aria-label": "Screenshots",
            onPaste: state.onPaste,
            onClick: (e: React.MouseEvent<HTMLDivElement>) => {
              // The markup dialog is this box's child in React, so its clicks arrive here too. Focusing the box for them
              // would take the keyboard away from the dialog, and with it Ctrl+Z and every other shortcut.
              if (!e.currentTarget.contains(e.target as Node)) return;
              if (!(e.target as HTMLElement).closest("button, input, a")) e.currentTarget.focus();
            },
            className: cn(
              // Focused: a solid outline (ready for Ctrl+V). Dragging a file over keeps its own look, the filled box.
              "grid cursor-default gap-2.5 rounded-[0.625rem] border border-dashed border-line p-3 transition-colors outline-none focus:border-solid focus:border-acc-b focus-visible:ring-3 focus-visible:ring-acc/30",
              over && "border-acc bg-acc-t2",
            ),
            onDragOver: (e: React.DragEvent) => {
              e.preventDefault();
              setOver(true);
            },
            onDragLeave: () => setOver(false),
            onDrop: (e: React.DragEvent) => {
              e.preventDefault();
              setOver(false);
              state.add(e.dataTransfer.files);
            },
          })}
    >
      {state.items.map((i) => (i.id ? <input key={i.key} type="hidden" name="uploadIds" value={i.id} /> : null))}
      <input
        ref={inputRef}
        id={id}
        type="file"
        multiple
        accept={IMAGE_TYPES.join(",")}
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          state.add([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
      {/* Opens the phone's camera straight away. */}
      <input
        ref={cameraRef}
        id={cameraInputId(id)}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          state.add([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
      {compact ? null : (
        <div className="flex flex-wrap items-center gap-3">
          {touch ? (
            <Button type="button" variant="outline" size="sm" onClick={() => cameraRef.current?.click()} disabled={full}>
              <CameraIcon /> Take photo
            </Button>
          ) : null}
          <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={full}>
            <ImagePlusIcon /> {touch ? "Choose from gallery" : "Add images"}
          </Button>
          {canCapture ? (
            <Button type="button" variant="outline" size="sm" onClick={state.capture} disabled={full} title="Capture a tab or window, such as the ERP">
              <MonitorIcon /> Capture screen
            </Button>
          ) : null}
          <span className="text-[0.7813rem] text-muted-foreground">
            {touch ? "" : "Or click this box and paste a screenshot (Ctrl+V), or drop images here. "}Each one opens in the markup tools first. Up to {MAX_IMAGES_PER_POST}, {IMAGE_MAX_BYTES / 1024 / 1024} MB each.
          </span>
        </div>
      )}
      {state.items.length ? (
        <ul className="flex flex-wrap gap-2.5">
          {state.items.map((i) => {
            const pct = i.size ? Math.min(100, Math.round((i.loaded / i.size) * 100)) : 0;
            return (
              <li key={i.key} className="relative w-32 overflow-hidden rounded-lg border border-line bg-surface2">
                {i.preview ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a local blob preview
                  <img src={i.preview} alt="" className={cn("h-20 w-full object-cover", !i.id && "opacity-60")} />
                ) : (
                  // Restored from a draft: the file is safely uploaded, but the phone no longer has its preview.
                  <div className="flex h-20 items-center justify-center text-muted-foreground" aria-hidden>
                    <ImageIcon className="size-6" />
                  </div>
                )}
                {!i.id && !i.failed ? (
                  <div className="h-1.5 overflow-hidden bg-surface3" role="progressbar" aria-label={`Uploading ${i.name}`} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                    <div className="h-full bg-acc transition-[width]" style={{ width: `${pct}%` }} />
                  </div>
                ) : null}
                <div className={cn("truncate px-2 py-1 text-[0.7188rem]", i.failed ? "font-medium text-destructive-text" : "text-muted-foreground")} title={i.name}>
                  {i.id ? formatBytes(i.size) : i.failed ? "Failed" : `${pct}%`} · {i.name}
                </div>
                {i.failed ? (
                  <div className="px-1.5 pb-1.5">
                    <Button type="button" variant="outline" size="sm" className="w-full" aria-label={`Retry ${i.name}`} onClick={() => state.retry(i.key)}>
                      <RotateCwIcon /> Retry
                    </Button>
                  </div>
                ) : null}
                {i.id && i.file ? (
                  <button
                    type="button"
                    onClick={() => state.edit(i.key)}
                    aria-label={`Mark up ${i.name} again`}
                    title="Mark up again"
                    className="absolute top-1 right-8 flex size-6 cursor-pointer items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
                  >
                    <PencilIcon className="size-3.5" />
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => state.remove(i.key)}
                  aria-label={i.id || i.failed ? `Remove ${i.name}` : `Cancel uploading ${i.name}`}
                  title={i.id || i.failed ? "Remove" : "Cancel upload"}
                  className="absolute top-1 right-1 flex size-6 cursor-pointer items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
                >
                  <XIcon className="size-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      {state.error ? (
        <p role="alert" className="text-[0.7813rem] font-medium text-destructive-text">
          {state.error}
        </p>
      ) : null}
      <MarkupEditor file={state.editing?.file ?? null} position={state.position} isEdit={state.editing?.replaceKey !== undefined} onDone={state.resolve} />
    </div>
  );
}
