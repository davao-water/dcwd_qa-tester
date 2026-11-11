"use client";

import { useEffect, useRef } from "react";
import { DRAFT_FIELDS, draftKey, isEmptyDraft, type DraftFile, type TicketDraft } from "@/lib/tickets/draft";
import type { ImageAttachments } from "@/components/attachments/use-image-attachments";
import type { useVideoUpload } from "@/components/attachments/video-picker";
import { storage } from "./storage";

/**
 * Keeps a new ticket's draft in this browser: a moment after typing, when files change, and when a phone hides or
 * unloads the page. Nothing is saved while the ticket is being sent.
 */
export function useDraftSaving(
  draftUserId: string | undefined,
  restored: TicketDraft | null,
  images: ImageAttachments,
  video: ReturnType<typeof useVideoUpload>,
) {
  const formRef = useRef<HTMLFormElement>(null);
  const typing = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Keeps the draft: a moment after typing, when files change, and when a phone hides or unloads the page.
  const save = useRef(() => {});
  // While a ticket is being sent, so a late save can't write it back. The draft itself goes only when the ticket page
  // confirms it was filed (draft-cleanup.tsx): anything else, like a dropped signal, must keep it.
  const filing = useRef(false);
  const uploadTimes = useRef(new Map(restored?.files.map((f) => [f.id, f.uploadedAt]) ?? []));

  const savedFiles = useRef<string | null>(null);
  useEffect(() => {
    save.current = () => {
      if (!draftUserId || filing.current || !formRef.current) return;
      const fd = new FormData(formRef.current);
      const fields: Record<string, string> = {};
      for (const k of DRAFT_FIELDS) {
        const v = fd.get(k);
        if (typeof v === "string") fields[k] = v;
      }
      const uploadedAt = (id: string) => {
        if (!uploadTimes.current.has(id)) uploadTimes.current.set(id, Date.now());
        return uploadTimes.current.get(id)!;
      };
      const files: DraftFile[] = images.items.flatMap((i) => (i.id ? [{ id: i.id, kind: "IMAGE" as const, name: i.name, size: i.size, durationSec: null, uploadedAt: uploadedAt(i.id) }] : []));
      if (video.upload.status === "done") {
        const { id, name, size, durationSec } = video.upload;
        files.push({ id, kind: "VIDEO", name, size, durationSec, uploadedAt: uploadedAt(id) });
      }
      const key = draftKey(draftUserId);
      storage((s) => (isEmptyDraft({ fields, files }) ? s.removeItem(key) : s.setItem(key, JSON.stringify({ savedAt: Date.now(), fields, files }))));
    };
    // Only when a file really came or went: on opening, the still-empty form must not overwrite a draft waiting to load.
    const uploaded = [...images.items.map((i) => i.id), video.upload.status === "done" ? video.upload.id : null].filter(Boolean).join();
    if (savedFiles.current !== null && savedFiles.current !== uploaded) save.current();
    savedFiles.current = uploaded;
  }, [draftUserId, images.items, video.upload]);

  useEffect(() => {
    if (!draftUserId) return;
    const onHide = () => document.visibilityState === "hidden" && save.current();
    const onLeave = () => save.current();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onLeave);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onLeave);
    };
  }, [draftUserId]);

  const saveSoon = () => {
    clearTimeout(typing.current);
    typing.current = setTimeout(() => save.current(), 500);
  };
  /** The ticket is being sent: stop saving until it's known whether it was filed. */
  const startFiling = () => {
    filing.current = true;
    clearTimeout(typing.current);
  };
  /** It wasn't filed: saving resumes. */
  const stopFiling = () => {
    filing.current = false;
  };
  const saveNow = () => save.current();

  return { formRef, saveSoon, startFiling, stopFiling, saveNow };
}
