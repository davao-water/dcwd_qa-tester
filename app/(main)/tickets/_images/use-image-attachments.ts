"use client";

import { shrinkImage } from "@/lib/markup/encode";
import type { DraftFile } from "@/lib/tickets/draft";
import { discardUpload, UploadCancelled, uploadFile, type UploadHandle } from "@/lib/uploads/client";
import { IMAGE_MAX_BYTES, IMAGE_TYPES, MAX_IMAGES_PER_POST } from "@/lib/uploads/limits";
import { useEffect, useRef, useState } from "react";
import type { MarkupResult } from "../markup/markup-editor";
import { captureFrame } from "./capture";

// Images for a ticket or comment: pick them, drop them, paste a screenshot (Ctrl+V) or capture a tab or window.
// Each one opens in the markup editor first (one at a time), then uploads straight to Storage; the form sends only
// their ids in "uploadIds". Edit reopens an added image and replaces its upload. An upload that fails stays on screen
// with Retry, because on mobile data that usually only means the signal dropped.

type Item = {
  key: number;
  /** Kept so Edit can reopen the image in the markup editor, and Retry can send it again. Null for one restored from a draft. */
  file: File | null;
  name: string;
  size: number;
  preview: string;
  loaded: number;
  /** Set once the server has checked the arrived file. */
  id: string | null;
  handle: UploadHandle | null;
  /** Why the upload failed; it waits for Retry or Remove. */
  failed: string | null;
};

/** An image waiting in the markup editor. With `replaceKey` it is an added image being edited again. */
type Queued = { file: File; replaceKey?: number };

let nextKey = 0;
export function useImageAttachments(restored: DraftFile[] = []) {
  const [items, setItems] = useState<Item[]>(() =>
    restored.map((f, i) => ({ key: -1 - i, file: null, name: f.name, size: f.size, preview: "", loaded: f.size, id: f.id, handle: null, failed: null })),
  );
  const [queue, setQueue] = useState<Queued[]>([]);
  // How many images the current run through the editor started with, for "2 of 3".
  const [batch, setBatch] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const live = useRef<Item[]>([]);
  useEffect(() => {
    live.current = items;
  }, [items]);
  // Screenshots being converted to a smaller file before upload (lib/markup/encode.ts).
  const [converting, setConverting] = useState(0);
  // Images still in the editor or being converted count as busy too: the post can't go without them.
  const busy = items.some((i) => !i.id && !i.failed) || queue.length > 0 || converting > 0;

  // Leaving the page mid-upload would throw the upload away; let the browser ask first.
  useEffect(() => {
    if (!busy) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);

  // When the form goes away: stop uploads still running (they could never be sent) and free the blob previews.
  useEffect(
    () => () =>
      live.current.forEach((i) => {
        i.handle?.cancel();
        URL.revokeObjectURL(i.preview);
      }),
    [],
  );

  const update = (key: number, patch: Partial<Item>) => setItems((list) => list.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  const drop = (key: number) =>
    setItems((list) => {
      const gone = list.find((i) => i.key === key);
      if (gone) URL.revokeObjectURL(gone.preview);
      return list.filter((i) => i.key !== key);
    });

  function send(key: number, file: File) {
    const handle = uploadFile(file, "IMAGE", (loaded) => update(key, { loaded }));
    update(key, { handle, failed: null, loaded: 0 });
    handle.done.then(
      (done) => update(key, { id: done.id, handle: null, loaded: file.size }),
      (e) => {
        if (e instanceof UploadCancelled) return drop(key);
        // Several images upload at once, so say which one this was.
        const message = e instanceof Error ? e.message : "It couldn't be uploaded. Try again.";
        setError(message.includes(file.name) ? message : `${file.name}: ${message}`);
        update(key, { handle: null, failed: message });
      },
    );
  }

  function start(file: File) {
    const key = nextKey++;
    setItems((list) => [...list, { key, file, name: file.name, size: file.size, preview: URL.createObjectURL(file), loaded: 0, id: null, handle: null, failed: null }]);
    send(key, file);
  }

  function add(list: Iterable<File>) {
    const incoming = [...list];
    const images = incoming.filter((f) => IMAGE_TYPES.includes(f.type));
    const tooBig = images.filter((f) => f.size > IMAGE_MAX_BYTES);
    const ok = images.filter((f) => f.size <= IMAGE_MAX_BYTES);
    const room = MAX_IMAGES_PER_POST - items.length - queue.length;
    enqueue(ok.slice(0, Math.max(0, room)).map((file) => ({ file })));
    if (incoming.some((f) => f.type === "image/heic" || f.type === "image/heif" || /\.hei[cf]$/i.test(f.name))) setError("HEIC photos can't be added. Use a JPEG photo or a screenshot.");
    else if (images.length < incoming.length) setError("Only PNG, JPEG, WebP and GIF images, and MP4 or WebM videos, can be added.");
    else if (tooBig.length) setError(`${tooBig.map((f) => f.name).join(", ")} is larger than ${IMAGE_MAX_BYTES / 1024 / 1024} MB.`);
    else if (ok.length > room) setError(`At most ${MAX_IMAGES_PER_POST} images per post.`);
    else setError(null);
  }

  /** A paste into the screenshot box, the page, or a reply's text box. Works with React's and the browser's paste event. */
  function onPaste(e: { clipboardData: DataTransfer | null; preventDefault(): void }) {
    const pasted = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/"));
    if (!pasted.length) return;
    e.preventDefault();
    // Screenshots arrive as "image.png"; give them a name that says when they were taken.
    const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
    add(pasted.map((f, i) => new File([f], `screenshot-${stamp}${pasted.length > 1 ? `-${i + 1}` : ""}.${f.type.split("/")[1] ?? "png"}`, { type: f.type })));
  }

  function enqueue(entries: Queued[]) {
    if (!entries.length) return;
    setBatch((n) => (queue.length ? n + entries.length : entries.length));
    setQueue((q) => [...q, ...entries]);
  }

  /** Cancels an upload in progress, or drops an uploaded image that hasn't been sent (the server deletes it). */
  function remove(key: number) {
    const item = live.current.find((i) => i.key === key);
    if (!item) return;
    if (item.handle) item.handle.cancel();
    else if (item.id) void discardUpload(item.id);
    drop(key);
  }

  /** What the editor decided for the image at the front of the queue. */
  function resolve(result: MarkupResult) {
    const [head] = queue;
    if (!head) return;
    setQueue((q) => q.slice(1));
    if (result.action === "remove") {
      if (head.replaceKey !== undefined) remove(head.replaceKey);
      return;
    }
    if (result.action === "original") {
      // Editing an added image and keeping it as it was: nothing to redo. A new one is saved smaller, same size.
      if (head.replaceKey === undefined) {
        setConverting((n) => n + 1);
        void shrinkImage(head.file)
          .then(start)
          .finally(() => setConverting((n) => n - 1));
      }
      return;
    }
    if (result.file.size > IMAGE_MAX_BYTES) {
      setError(`${result.file.name} is larger than ${IMAGE_MAX_BYTES / 1024 / 1024} MB.`);
      return;
    }
    if (head.replaceKey !== undefined) remove(head.replaceKey);
    start(result.file);
  }

  return {
    items,
    error,
    busy,
    /** An upload failed and is waiting for Retry or Remove; sending now would leave it out. */
    failed: items.some((i) => i.failed),
    add,
    onPaste,
    /** The image in the markup editor now, and where it is in the run ("2 of 3"). */
    editing: queue[0] ?? null,
    position: queue.length ? { index: batch - queue.length + 1, total: batch } : null,
    resolve,
    /** Reopens an added image in the editor; saving replaces its upload. */
    edit: (key: number) => {
      const item = items.find((i) => i.key === key);
      if (item?.file) enqueue([{ file: item.file, replaceKey: key }]);
    },
    retry: (key: number) => {
      const item = items.find((i) => i.key === key);
      if (!item?.file) return;
      setError(null);
      send(key, item.file);
    },
    /** Grabs one frame of a tab or window the person picks and opens it in the editor. */
    capture: async () => {
      if (items.length + queue.length >= MAX_IMAGES_PER_POST) return setError(`At most ${MAX_IMAGES_PER_POST} images per post.`);
      const file = await captureFrame();
      if (file) add([file]);
    },
    remove,
    /** After the post went through: the images now belong to it, so just forget them here. */
    clear: () => {
      items.forEach((i) => URL.revokeObjectURL(i.preview));
      setItems([]);
      setError(null);
    },
  };
}

export type ImageAttachments = ReturnType<typeof useImageAttachments>;
