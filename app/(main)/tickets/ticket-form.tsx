"use client";

import { startTransition, useActionState, useEffect, useEffectEvent, useRef, useState } from "react";
import { Field, FormMessage, FormSection } from "@/components/form-field";
import { InlineAlert } from "@/components/inline-alert";
import { SelectField } from "@/components/select-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { moduleOptions, pathTo } from "@/lib/areas/tree";
import { ROLE_LABELS, type Role } from "@/lib/auth/permissions";
import { initialFormState, type FormState } from "@/lib/form";
import { takeSharedFiles } from "@/lib/tickets/shared-files";
import { IMAGE_MAX_BYTES, MAX_IMAGES_PER_POST, VIDEO_MAX_MB, VIDEO_MAX_SECONDS, VIDEO_TYPES } from "@/lib/uploads/limits";
import { DRAFT_FIELDS, draftKey, FILING_KEY, guessDevice, isDeviceType, isEmptyDraft, parseDraft, type DraftFile, type TicketDraft } from "@/lib/tickets/draft";
import { CATEGORY_LABELS, DEVICE_LABELS, DEVICE_TYPES, foundInOptions, TICKET_CATEGORIES, PRIORITIES, PRIORITY_LABELS, SEVERITIES, SEVERITY_LABELS, TICKET_TYPES, TYPE_LABELS, type DeviceType, type SeverityValue, type TicketType } from "@/lib/tickets/workflow";
import { cn } from "@/lib/utils";
import { createTicket, editTicket } from "./actions";
import { EVIDENCE_BOX, EVIDENCE_INPUT, EvidenceBox } from "./evidence-box";
import { levelDot, TYPE_ICON, TypeTile, typeStyle } from "./ticket-bits";
import { useImageAttachments } from "./image-picker";
import { useVideoUpload } from "./video-picker";

/** A module with what's inside it, at every level (lib/areas/tree.ts). */
export type AreaOption = { id: string; name: string; children: AreaOption[] };
/** A developer or admin, with the areas they belong to, so the picker can suggest the right people. */
export type AssigneeOption = { id: string; name: string; role: Role; areaIds: string[]; leadAreaIds: string[] };

export type TicketValues = {
  id: string;
  number: number;
  type: TicketType;
  title: string;
  description: string;
  areaId: string | null;
  severity: SeverityValue | null;
  priority: (typeof PRIORITIES)[number];
  foundIn: string | null;
  deviceType: DeviceType | null;
};

/** The last Device type chosen in this browser. */
const DEVICE_KEY = "qa-hub:device-type";

/** Browser storage can be unavailable (private windows); a draft or remembered choice is only a convenience. */
function storage(run: (s: Storage) => void) {
  try {
    run(localStorage);
  } catch {
    // Nothing to do: the form still works, it just won't remember.
  }
}

/**
 * `<form action>` resets every field once the action finishes, even when it failed validation, which would lose a long
 * description and the uploaded files' ids. Submitting this way keeps what the user typed.
 */
export function submitKeepingInput(action: (fd: FormData) => void) {
  return (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => action(fd));
  };
}

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

const TYPE_HINTS: Record<TicketType, string> = {
  BUG: "Something in the ERP is wrong or broken.",
  SUGGESTION: "An idea for something new.",
  IMPROVEMENT: "Something that works but could be better.",
};

export function AreaSelect({ areas, value, onChange, emptyLabel, invalid, id = "areaId" }: { areas: AreaOption[]; value: string; onChange: (v: string) => void; emptyLabel: string; invalid?: boolean; id?: string }) {
  return (
    <SelectField
      id={id}
      name="areaId"
      value={value}
      onValueChange={onChange}
      aria-invalid={invalid}
      groups={[
        { options: [{ value: "", label: emptyLabel }] },
        ...moduleOptions(areas, "whole module"),
      ]}
    />
  );
}

/** Developers in the chosen area (or any module it sits inside) first, with the lead marked; everyone else after. */
export function AssigneeSelect({
  areas,
  people,
  areaId,
  defaultValue,
  id = "assigneeId",
  onValueChange,
}: {
  areas: AreaOption[];
  people: AssigneeOption[];
  areaId: string;
  defaultValue?: string;
  id?: string;
  onValueChange?: (assigneeId: string) => void;
}) {
  const scope = areaId ? pathTo(areas, areaId).map((a) => a.id) : [];
  const inArea = people
    .filter((p) => p.areaIds.some((a) => scope.includes(a)))
    .sort((a, b) => Number(b.leadAreaIds.some((x) => scope.includes(x))) - Number(a.leadAreaIds.some((x) => scope.includes(x))));
  const others = people.filter((p) => !inArea.includes(p));
  const label = (p: AssigneeOption) =>
    `${p.name}${p.leadAreaIds.some((x) => scope.includes(x)) ? " · lead" : ""}${p.role === "ADMIN" ? ` · ${ROLE_LABELS.ADMIN}` : ""}`;

  return (
    <SelectField
      key={areaId}
      id={id}
      name="assigneeId"
      defaultValue={defaultValue ?? ""}
      onValueChange={onValueChange}
      groups={[
        { options: [{ value: "", label: "— Not assigned yet —" }] },
        ...(inArea.length ? [{ label: "Works on this module", options: inArea.map((p) => ({ value: p.id, label: label(p) })) }] : []),
        { label: inArea.length ? "Everyone else" : "Developers", options: others.map((p) => ({ value: p.id, label: label(p) })) },
      ]}
    />
  );
}

type TicketFormProps = {
  areas: AreaOption[];
  people: AssigneeOption[];
  canAssign: boolean;
  ticket?: TicketValues;
  onDone?: () => void;
  /** New ticket only: whose draft to keep in this browser (lib/tickets/draft.ts). */
  draftUserId?: string;
};

/** What Share → QA Hub brought. None means it didn't arrive. */
type SharedFiles = { files: File[] };

/** New ticket (no `ticket`) or edit an existing one. */
export function TicketForm(props: TicketFormProps) {
  const { ticket, draftUserId } = props;
  // Browser storage only exists after hydration, so a draft fills the form by starting it again with those values.
  const [restored, setRestored] = useState<{ run: number; draft: TicketDraft | null }>({ run: 0, draft: null });
  const [defaultDevice, setDefaultDevice] = useState<DeviceType | "">("");
  const [shared, setShared] = useState<SharedFiles | null>(null);
  const loaded = useRef(false);
  const sent = useRef(false);

  useEffect(() => {
    if (ticket) return;
    queueMicrotask(() => {
      // Next keeps a page's state when you move away and runs this again on the way back. Open work stays as it is,
      // unless it was filed meanwhile (its draft is gone): then this is a new ticket, not the old one again.
      if (loaded.current) {
        let waiting = false;
        storage((s) => {
          waiting = !!draftUserId && !!s.getItem(draftKey(draftUserId));
        });
        if (sent.current && !waiting) {
          sent.current = false;
          setRestored((r) => ({ run: r.run + 1, draft: null }));
        }
        return;
      }
      loaded.current = true;
      let remembered: string | null = null;
      storage((s) => {
        remembered = s.getItem(DEVICE_KEY);
        if (!draftUserId) return;
        const raw = s.getItem(draftKey(draftUserId));
        const draft = parseDraft(raw, Date.now());
        if (draft) setRestored({ run: 1, draft });
        // Too old to use: nothing typed stays on the phone any longer.
        else if (raw) s.removeItem(draftKey(draftUserId));
      });
      setDefaultDevice(isDeviceType(remembered) ? remembered : guessDevice(navigator.userAgent, navigator.maxTouchPoints));
      // Share → QA Hub: collected here, after the draft is settled, because restoring one starts the fields again. Whatever
      // the address says: signing in can land somewhere else first, and the file should still be here when they come.
      const url = new URL(window.location.href);
      const share = url.searchParams.get("shared");
      if (share) {
        url.searchParams.delete("shared");
        window.history.replaceState(null, "", url);
      }
      ("caches" in window ? takeSharedFiles() : Promise.resolve([])).then(
        (files) => {
          if (files.length || share) setShared({ files });
        },
        () => {
          if (share) setShared({ files: [] });
        },
      );
    });
  }, [ticket, draftUserId]);

  function clearDraft() {
    if (draftUserId) storage((s) => s.removeItem(draftKey(draftUserId)));
    setRestored((r) => ({ run: r.run + 1, draft: null }));
  }

  return <TicketFormFields key={restored.run} {...props} restored={restored.draft} defaultDevice={defaultDevice} shared={shared} onSharedUsed={() => setShared(null)} onClearDraft={clearDraft} onSending={(sending) => (sent.current = sending)} />;
}

function TicketFormFields({
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
  const form = useRef<HTMLFormElement>(null);
  const typing = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Keeps the draft: a moment after typing, when files change, and when a phone hides or unloads the page.
  const save = useRef(() => {});
  // While a ticket is being sent, so a late save can't write it back. The draft itself goes only when the ticket page
  // confirms it was filed (draft-cleanup.tsx): anything else, like a dropped signal, must keep it.
  const filing = useRef(false);
  const uploadTimes = useRef(new Map(restored?.files.map((f) => [f.id, f.uploadedAt]) ?? []));
  const [state, action, pending] = useActionState(async (prev: FormState, fd: FormData) => {
    filing.current = true;
    clearTimeout(typing.current);
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
      filing.current = false;
      onSending(false);
      save.current();
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

  const savedFiles = useRef<string | null>(null);
  useEffect(() => {
    save.current = () => {
      if (!draftUserId || filing.current || !form.current) return;
      const fd = new FormData(form.current);
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

  const foundIn = ticket?.foundIn ?? d?.foundIn ?? "";
  /** A field across both columns of New ticket's Details card. */
  const wide = !ticket ? "xl:col-span-2" : undefined;

  const saveSoon = () => {
    clearTimeout(typing.current);
    typing.current = setTimeout(() => save.current(), 500);
  };

  return (
    <form ref={form} onSubmit={submitKeepingInput(action)} onInput={saveSoon} className={cn("@container grid gap-5", !ticket && "xl:flex xl:min-h-0 xl:flex-1 xl:flex-col")}>
      {shareNote ? <InlineAlert tone="warn" role="status">{shareNote}</InlineAlert> : null}
      {restored ? (
        <InlineAlert tone="info" role="status">
          <div className="grid justify-items-start gap-2">
            <span>Draft restored. Files that hadn&apos;t finished uploading need adding again.</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                // Everything goes, including what was added since: the server deletes the uploads and any still running stops.
                images.items.forEach((i) => images.remove(i.key));
                video.cancel();
                video.remove();
                onClearDraft();
              }}
            >
              Clear
            </Button>
          </div>
        </InlineAlert>
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
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-medium">What is it?</legend>
            {/* Phones: three compact buttons side by side (icon over name); the picked one is outlined and bold. */}
            <div className="grid grid-cols-3 gap-2.5 md:grid-cols-[repeat(auto-fit,minmax(11.25rem,1fr))]">
              {TICKET_TYPES.map((t) => {
                const Icon = TYPE_ICON[t];
                return (
                <label
                  key={t}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-[0.625rem] border border-line p-4 text-sm transition-[border-color,background-color,transform] duration-200 active:scale-[0.99] has-focus-visible:ring-3 has-focus-visible:ring-acc/25 max-md:flex-col max-md:items-center max-md:gap-1.5 max-md:rounded-xl max-md:border-[0.125rem] max-md:px-1 max-md:py-3 max-md:text-center max-md:has-checked:font-semibold",
                    typeStyle(t).choice,
                    "md:hover:border-line md:hover:bg-row-hover md:has-checked:border-2 md:has-checked:border-acc md:has-checked:bg-acc-t2 md:has-checked:p-[0.9375rem]",
                  )}
                >
                  <input type="radio" name="type" value={t} checked={type === t} onChange={() => setType(t)} className="sr-only" />
                  <TypeTile type={t} className="max-md:hidden" />
                  <span className="min-w-0 max-md:contents">
                    <span className="flex items-center gap-1.5 font-medium max-md:flex-col max-md:gap-1.5">
                      <Icon className={cn("size-6 md:hidden", typeStyle(t).icon)} aria-hidden />
                      {TYPE_LABELS[t]}
                    </span>
                    <span className="mt-0.5 block text-sm text-muted-foreground max-md:hidden">{TYPE_HINTS[t]}</span>
                  </span>
                </label>
                );
              })}
            </div>
          </fieldset>

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
          {/* Severity and Device type come last: only Bug has them, so choosing another type moves nothing above them. */}
          <div className={cn("grid gap-4", !ticket && "xl:min-h-0 xl:flex-1 xl:grid-cols-2 xl:content-start xl:overflow-y-auto xl:p-0.5")}>
            <Field label="Module" htmlFor="areaId" error={err.areaId} className={wide} required={!ticket} tip="Where in the ERP. It decides who is suggested for Developer.">
              <AreaSelect areas={areas} value={areaId} onChange={setAreaId} emptyLabel={ticket ? "— Not set —" : "Choose a module"} invalid={!!err.areaId} />
            </Field>
            {/* After filing, the developer corrects it in the ticket's Details, so it isn't in the edit dialog. */}
            {!ticket ? (
              <Field label="Category" htmlFor="category" error={err.category} className={wide} required tip="Front-end is what you see on screen. Back-end is data and processing. UI/UX is design work. It counts in Module progress on the Dashboard, and the developer can correct it later.">
                <SelectField id="category" name="category" defaultValue={d?.category ?? ""} aria-invalid={!!err.category} options={[{ value: "", label: "Choose a category" }, ...TICKET_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c] }))]} />
              </Field>
            ) : null}
            <Field label="Found in" htmlFor="foundIn" error={err.foundIn} tip="Optional: which environment you saw it in.">
              <SelectField id="foundIn" name="foundIn" defaultValue={foundIn} options={[{ value: "", label: "— Not set —" }, ...foundInOptions(foundIn).map((v) => ({ value: v, label: v }))]} />
            </Field>
            <Field label="Priority" htmlFor="priority" error={err.priority} required tip="How soon it should be looked at.">
              <SelectField id="priority" name="priority" defaultValue={ticket?.priority ?? d?.priority ?? "P3"} options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABELS[p], dot: levelDot(p) }))} />
            </Field>
            {!ticket && canAssign ? (
              <Field label="Developer" htmlFor="assigneeId" error={err.assigneeId} className={wide} tip="Who should fix it. You can change it later.">
                <AssigneeSelect areas={areas} people={people} areaId={areaId} defaultValue={d?.assigneeId} />
              </Field>
            ) : null}
            {type === "BUG" ? (
              <Field label="Severity" htmlFor="severity" error={err.severity} required tip="How bad the effect is: S1 blocks work or gets money wrong.">
                <SelectField id="severity" name="severity" defaultValue={ticket?.severity ?? d?.severity ?? "S3"} options={SEVERITIES.map((s) => ({ value: s, label: SEVERITY_LABELS[s], dot: levelDot(s) }))} />
              </Field>
            ) : null}
            {type === "BUG" ? (
              <Field label="Device type" htmlFor="deviceType" error={err.deviceType} tip="What the bug happened on.">
                <SelectField
                  id="deviceType"
                  name="deviceType"
                  value={device ?? defaultDevice}
                  onValueChange={setDevice}
                  options={[{ value: "", label: "— Not set —" }, ...DEVICE_TYPES.map((t) => ({ value: t, label: DEVICE_LABELS[t] }))]}
                />
              </Field>
            ) : null}
          </div>
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
