"use client";

import { useRef, useState } from "react";
import { CameraIcon, ImagePlusIcon, MonitorIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTouchScreen } from "@/hooks/use-touch-screen";
import { IMAGE_TYPES, MAX_IMAGES_PER_POST, VIDEO_TYPES } from "@/lib/uploads/limits";
import { cn } from "@/lib/utils";
import { useCanCapture } from "@/components/attachments/capture";
import type { ImageAttachments } from "@/components/attachments/use-image-attachments";
import { cameraInputId, ImagePicker } from "@/components/attachments/image-picker";
import { VideoPicker, type VideoUpload } from "@/components/attachments/video-picker";

// New ticket's one upload box for screenshots and a video. The two pickers keep their own uploads, markup, progress, retry and
// checks and only show what was added; this box adds the ways in. Clicking it arms paste, so it says what to do next.

/** The box's file picker, which the field's label opens. */
export const EVIDENCE_INPUT = "evidence-files";
/** The box itself, which a "missing attachment" error moves the focus to. */
export const EVIDENCE_BOX = "evidence-box";
const IMAGES = "images";
const VIDEO = "video";

export function EvidenceBox({ images, video }: { images: ImageAttachments; video: VideoUpload }) {
  const touch = useTouchScreen();
  const canCapture = useCanCapture();
  const input = useRef<HTMLInputElement>(null);
  const [armed, setArmed] = useState(false);
  const [noImage, setNoImage] = useState(false);
  const [over, setOver] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const full = images.items.length >= MAX_IMAGES_PER_POST;

  function addFiles(files: File[]) {
    const clips = files.filter((f) => VIDEO_TYPES.includes(f.type));
    const rest = files.filter((f) => !VIDEO_TYPES.includes(f.type));
    if (clips.length) void video.start(clips[0]);
    if (rest.length) images.add(rest);
    setNote(clips.length > 1 ? "A ticket takes one video, so only the first one was added." : null);
  }

  // A phone has no Ctrl+V to get ready for.
  const ready = armed && !touch;
  const message = touch ? "Each image opens in the markup tools first." : !armed ? "Or click this box and paste a screenshot (Ctrl+V), or drop files here." : noImage ? "No image was copied. Copy a screenshot, then press Ctrl+V." : "Ready to paste. Press Ctrl+V.";
  const hasFiles = images.items.length > 0 || !!images.error || video.upload.status !== "idle" || !!video.error;

  return (
    <div
      id={EVIDENCE_BOX}
      tabIndex={0}
      role="group"
      aria-label="Screenshots and video"
      onFocus={(e) => {
        if (e.target !== e.currentTarget) return;
        setArmed(true);
        setNoImage(false);
      }}
      onBlur={(e) => {
        if (e.target !== e.currentTarget) return;
        setArmed(false);
        setNoImage(false);
      }}
      onClick={(e) => {
        // The markup dialog is this box's child in React, so its clicks arrive here too. Focusing the box for them would take the
        // keyboard away from the dialog, and with it Ctrl+Z and every other shortcut.
        if (!e.currentTarget.contains(e.target as Node)) return;
        if (!(e.target as HTMLElement).closest("button, input, a")) e.currentTarget.focus();
      }}
      onPaste={(e) => {
        if (![...e.clipboardData.files].some((f) => f.type.startsWith("image/"))) return setNoImage(true);
        setNoImage(false);
        images.onPaste(e);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        // The markup dialog again: what's dropped on it isn't for this box.
        if (e.currentTarget.contains(e.target as Node)) addFiles([...e.dataTransfer.files]);
      }}
      className={cn(
        "grid cursor-pointer content-center justify-items-center rounded-[0.625rem] border-[0.09375rem] border-dashed border-acc-b bg-acc-t2 p-6 text-center text-sm text-body2 transition-colors outline-none hover:border-acc xl:h-full",
        (ready || over) && "border-2 border-solid border-acc bg-acc-t p-[1.4375rem] shadow-[0_0_0_0.1875rem_color-mix(in_srgb,var(--acc)_12%,transparent)]",
      )}
    >
      <input
        ref={input}
        id={EVIDENCE_INPUT}
        type="file"
        multiple
        accept={[...IMAGE_TYPES, ...VIDEO_TYPES].join(",")}
        className="sr-only"
        tabIndex={-1}
        aria-label="Add images or a video"
        onChange={(e) => {
          addFiles([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
      <div className="flex flex-wrap items-center justify-center gap-2">
        {touch ? (
          <Button type="button" variant="outline" size="sm" onClick={() => document.getElementById(cameraInputId(IMAGES))?.click()} disabled={full}>
            <CameraIcon /> Take photo
          </Button>
        ) : null}
        <Button type="button" variant="outline" size="sm" onClick={() => input.current?.click()}>
          <ImagePlusIcon /> {touch ? "Choose from gallery" : "Add image/video"}
        </Button>
        {canCapture && !touch ? (
          <Button type="button" variant="outline" size="sm" onClick={images.capture} disabled={full} title="Capture a tab or window, such as the ERP">
            <MonitorIcon /> Capture screen
          </Button>
        ) : null}
      </div>
      <span aria-live="polite" className={cn("mt-2.5", ready && "font-semibold", ready && (noImage ? "text-destructive-text" : "text-primary-text"))}>
        {message}
      </span>
      {note ? <p role="status" className="mt-2.5 text-[0.7813rem] font-medium text-warn-ink">{note}</p> : null}
      {/* The pickers only show what was added; with nothing added, just their hidden inputs. */}
      <div className={cn("grid w-full justify-items-start gap-2.5 text-left", hasFiles && "mt-2.5")}>
        <ImagePicker state={images} id={IMAGES} compact />
        <VideoPicker state={video} id={VIDEO} compact />
      </div>
    </div>
  );
}
