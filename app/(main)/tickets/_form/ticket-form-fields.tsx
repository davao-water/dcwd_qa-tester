"use client";

import { useActionState, useEffect, useEffectEvent, useState } from "react";
import { Field, FormMessage, FormSection } from "@/components/form-field";
import { InlineAlert } from "@/components/inline-alert";
import { submitKeepingInput } from "@/components/submit-keeping-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { initialFormState, type FormState } from "@/lib/form";
import { FILING_KEY, type TicketDraft } from "@/lib/tickets/draft";
import { IMAGE_MAX_BYTES, MAX_IMAGES_PER_POST, VIDEO_MAX_MB, VIDEO_MAX_SECONDS, VIDEO_TYPES } from "@/lib/uploads/limits";
import type { DeviceType, TicketType } from "@/lib/tickets/workflow";
import { cn } from "@/lib/utils";
import { createTicket, editTicket } from "../actions";
import { EVIDENCE_BOX, EVIDENCE_INPUT, EvidenceBox } from "../evidence-box";
import { useImageAttachments } from "../_images/use-image-attachments";
import { useVideoUpload } from "../video-picker";
import { DetailsFields } from "./details-fields";
import { DraftRestored } from "./draft-restored";
import { DEVICE_KEY, storage } from "./storage";
import { TypePicker } from "./type-picker";
import type { SharedFiles, TicketFormProps } from "./types";
import { useDraftSaving } from "./use-draft-saving";

/** Each field that can be refused and what to focus for it, in the order the form is read. */
const ERROR_ORDER = [
  ["title", "title"],
  ["description", "description"],
  ["uploadIds", EVIDENCE_BOX],
  ["areaId", "areaId"],
  ["category", "category"],
] as const;

const DESCRIPTION_HINTS: Record<TicketType, string> = {
  BUG: "Input the Ticket Description Here.",
  SUGGESTION: "Describe your idea and how it would help.",
  IMPROVEMENT: "Describe what could work better and why it helps.",
};

/** The ticket form itself: what happened, the files, and the details. Started again (a new `key`) when a draft loads. */
export function TicketFormFields({
  areas,
  people,
  canAssign,
  ticket,
  onDone,
  draftUserId,
  restored,
  defaultDevice,
  shared,
  onSharedUsed,
  onClearDraft,
  onSending,
}: TicketFormProps & { restored: TicketDraft | null; defaultDevice: DeviceType | ""; shared: SharedFiles | null; onSharedUsed: () => void; onClearDraft: () => void; onSending: (sending: boolean) => void }) {
  const images = useImageAttachments(restored?.files.filter((f) => f.kind === "IMAGE"));
  const video = useVideoUpload(restored?.files.find((f) => f.kind === "VIDEO"));
  const [shareNote, setShareNote] = useState<string | null>(null);
  // Shared files go through the same steps as picked ones: markup, upload and every check.
  const addShared = useEffectEvent(({ files }: SharedFiles) => {
    onSharedUsed();
    const videos = files.filter((f) => VIDEO_TYPES.includes(f.type));
    const others = files.filter((f) => !VIDEO_TYPES.includes(f.type));
    if (others.length) images.add(others);
    if (videos.length) void video.start(videos[0]);
    if (!files.length) setShareNote("The shared file didn't reach QA Hub. Add it here instead.");
    else if (videos.length > 1) setShareNote("A ticket takes one video, so only the first one was added.");
  });
  useEffect(() => {
    if (shared) queueMicrotask(() => addShared(shared));
  }, [shared]);
  const { formRef, saveSoon, startFiling, stopFiling, saveNow } = useDraftSaving(draftUserId, restored, images, video);
  const [state, action, pending] = useActionState(async (prev: FormState, fd: FormData) => {
    startFiling();
    onSending(true);
    const device = fd.get("deviceType");
    if (!ticket && typeof device === "string" && device) storage((s) => s.setItem(DEVICE_KEY, device));
    if (!ticket) {
      const mark = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
      fd.set("filing", mark);
      try {
        sessionStorage.setItem(FILING_KEY, mark);
      } catch {
        // No storage, no draft to delete either.
      }
    }
    // Not filed: the form stays as it is, and is saved in case the phone unloads it now.
    const notSent = () => {
      stopFiling();
      onSending(false);
      saveNow();
    };
    try {
      const r = ticket ? await editTicket(prev, fd) : await createTicket(prev, fd);
      if (r.ok) onDone?.();
      else notSent();
      return r;
    } catch (e) {
      // Next's redirect after filing, and server errors, carry a digest and go on as usual.
      if (e && typeof e === "object" && "digest" in e) throw e;
      // No answer: a dropped signal, or the answer was lost after the server acted, so it may have gone through.
      notSent();
      return { ok: false, message: "This may not have gone through. Check your connection, and check Tickets before trying again. Nothing you added is lost." };
    }
  }, initialFormState);
  const err = state.fieldErrors ?? {};
  // After a refused post, the keyboard goes to the first thing to fix, in the order the form is read.
  useEffect(() => {
    const errors = state.fieldErrors;
    if (!errors) return;
    const first = ERROR_ORDER.find(([field]) => errors[field]?.length);
    if (first) document.getElementById(first[1])?.focus();
  }, [state.fieldErrors]);
  const d = restored?.fields;
  const [type, setType] = useState<TicketType>(ticket?.type ?? (d?.type as TicketType | undefined) ?? "BUG");
  const [areaId, setAreaId] = useState(ticket?.areaId ?? d?.areaId ?? "");
  const [device, setDevice] = useState<string | null>(ticket ? (ticket.deviceType ?? "") : (d?.deviceType ?? null));

  return (
    <form ref={formRef} onSubmit={submitKeepingInput(action)} onInput={saveSoon} className={cn("@container grid gap-5", !ticket && "xl:flex xl:min-h-0 xl:flex-1 xl:flex-col")}>
      {shareNote ? <InlineAlert tone="warn" role="status">{shareNote}</InlineAlert> : null}
      {restored ? (
        <DraftRestored
          onClear={() => {
            // Everything goes, including what was added since: the server deletes the uploads and any still running stops.
            images.items.forEach((i) => images.remove(i.key));
            video.cancel();
            video.remove();
            onClearDraft();
          }}
        />
      ) : null}
      {ticket ? (
        <>
          <input type="hidden" name="id" value={ticket.id} />
          <input type="hidden" name="number" value={ticket.number} />
        </>
      ) : null}

      {/* New ticket: what happened in the main card, the details in one beside it, dropping under when they no longer fit. From xl they
          fill the window (tickets/new/page.tsx), so the page doesn't scroll and a card with too much in it scrolls inside. In the edit dialog, one plain column. */}
      <div className={cn("flex flex-wrap items-stretch gap-6", ticket && "gap-5", !ticket && "xl:min-h-0 xl:flex-1 xl:flex-nowrap")}>
        <div className={cn("grid min-w-0 flex-[999_1_35rem] content-start gap-5", !ticket && "rounded-[0.875rem] border border-line bg-card p-5 shadow-(--shadow-card) max-md:rounded-2xl max-md:border-transparent md:p-6 xl:flex xl:flex-col xl:overflow-y-auto")}>
          <TypePicker type={type} onType={setType} />

          <Field label="Title" htmlFor="title" error={err.title} required tip="One line someone can understand from the list, e.g. “Senior citizen discount not applied on bill reprint”.">
            <Input id="title" name="title" defaultValue={ticket?.title ?? d?.title} required minLength={5} maxLength={150} aria-invalid={!!err.title} placeholder="e.g. Senior citizen discount not applied on bill reprint" />
          </Field>

          <Field
            label="Description"
            htmlFor="description"
            error={err.description}
            className={cn(!ticket && "xl:min-h-36 xl:flex-[1_1_9rem] xl:grid-rows-[auto_minmax(0,1fr)_auto] xl:content-stretch")}
            tip={type === "BUG" ? "Steps to reproduce, what you expected, and what happened instead. Use QA- test accounts where you can." : "What you'd like and why it helps."}
          >
            <Textarea
              id="description"
              name="description"
              defaultValue={ticket?.description ?? d?.description}
              maxLength={20000}
              rows={8}
              className={cn("min-h-40", !ticket && "xl:h-full xl:min-h-24 xl:resize-none")}
              aria-invalid={!!err.description}
              placeholder={DESCRIPTION_HINTS[type]}
            />
          </Field>

          {!ticket ? (
            <Field label="Screenshots and video" htmlFor={EVIDENCE_INPUT} error={err.uploadIds} required className="xl:flex-[1_0_10rem] xl:grid-rows-[auto_minmax(auto,1fr)_auto] xl:content-stretch" tip={`Up to ${MAX_IMAGES_PER_POST} images, ${IMAGE_MAX_BYTES / 1024 / 1024} MB each, opened in the markup tools first. One MP4 or WebM video, up to ${VIDEO_MAX_SECONDS / 60} min and ${VIDEO_MAX_MB} MB.`}>
              <EvidenceBox images={images} video={video} />
            </Field>
          ) : null}
        </div>
        <div className={cn("flex min-w-0 flex-[1_1_20rem] flex-col gap-4", !ticket && "rounded-[0.875rem] border border-line bg-card p-5 shadow-(--shadow-card) max-md:rounded-2xl max-md:border-transparent xl:flex-[0_0_27.5rem] xl:overflow-hidden")}>
          {ticket ? <FormSection>Details</FormSection> : <h2 className="text-lg font-semibold">Details</h2>}
          <DetailsFields
            ticket={ticket}
            d={d}
            err={err}
            areas={areas}
            people={people}
            canAssign={canAssign}
            type={type}
            areaId={areaId}
            onAreaId={setAreaId}
            device={device}
            onDevice={setDevice}
            defaultDevice={defaultDevice}
          />
          <FormMessage state={state} />
          {/* Phones: the main button stays at the bottom of the screen, full width, clear of the home bar. */}
          <div className={cn("flex justify-end gap-2 max-md:sticky max-md:bottom-0 max-md:z-10 max-md:-mx-5 max-md:-mb-5 max-md:border-t max-md:border-line2 max-md:bg-card/90 max-md:px-5 max-md:pt-3 max-md:pb-[calc(0.75rem+env(safe-area-inset-bottom))] max-md:backdrop-blur-xl", !ticket && "shrink-0 md:mt-auto")}>
            <Button type="submit" disabled={pending || video.busy || images.busy || images.failed || video.blocked} size="lg" className={cn("max-md:h-12 max-md:w-full max-md:rounded-[0.875rem] max-md:text-base", !ticket && "md:w-full")}>

              {video.busy ? "Uploading video…" : images.busy ? "Uploading…" : images.failed || video.blocked ? "Finish the files above" : pending ? "Saving…" : ticket ? "Save changes" : "File ticket"}
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}
