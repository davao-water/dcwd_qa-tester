// A ticket being filed on a phone. Testers switch to the app under test to take more screenshots, and the phone may
// unload QA Hub meanwhile, so the form is kept in this browser until it is filed. Uploaded files stay in Storage as
// pending uploads; only their ids and names are kept here.

import { DEVICE_TYPES, type DeviceType } from "./workflow";

/** The same as PENDING_TTL_MS in pending-uploads.ts: a file not sent within this long is removed from Storage. */
export const DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** The fields a draft keeps. */
export const DRAFT_FIELDS = ["type", "title", "description", "areaId", "category", "severity", "priority", "foundIn", "deviceType", "assigneeId"] as const;

export type DraftFile = { id: string; kind: "IMAGE" | "VIDEO"; name: string; size: number; durationSec: number | null; uploadedAt: number };
export type TicketDraft = { savedAt: number; fields: Record<string, string>; files: DraftFile[] };

const DRAFT_PREFIX = "qa-hub:ticket-draft:";
/** Per person, so someone else signing in on a shared phone doesn't get it. */
export const draftKey = (userId: string) => `${DRAFT_PREFIX}${userId}`;

/** sessionStorage: the mark of the ticket this tab is sending, which the redirect after filing carries back. */
export const FILING_KEY = "qa-hub:filing";
const FILING_MARK = /^[a-z0-9]{1,40}$/;

/** A mark from a form, or null if it isn't one; it goes into the address after filing. */
export const filingMark = (v: unknown): string | null => (typeof v === "string" && FILING_MARK.test(v) ? v : null);

/**
 * Whether this visit is this browser's own filing landing. The address keeps ?filing=, so Back, a reload or a copied link
 * can come here again; only the first landing in the tab that sent the ticket may delete a draft.
 */
export const isOwnFiling = (mark: string | null, stored: string | null) => !!mark && mark === stored;

/** On sign-out: this phone may be shared, so nothing typed stays behind. */
export function removeAllDrafts(store: Pick<Storage, "length" | "key" | "removeItem">) {
  const keys = Array.from({ length: store.length }, (_, i) => store.key(i)).filter((k): k is string => !!k?.startsWith(DRAFT_PREFIX));
  keys.forEach((k) => store.removeItem(k));
}

/** Only what the person wrote or attached counts: a form with nothing but its default choices isn't worth keeping. */
export function isEmptyDraft(d: Pick<TicketDraft, "fields" | "files">): boolean {
  return !d.fields.title?.trim() && !d.fields.description?.trim() && !d.files.length;
}

const isFile = (f: unknown): f is DraftFile => {
  const x = f as DraftFile | null;
  return !!x && typeof x.id === "string" && (x.kind === "IMAGE" || x.kind === "VIDEO") && typeof x.name === "string" && typeof x.size === "number" && typeof x.uploadedAt === "number";
};

/** The stored draft, or null if there is none, it's too old, or it can't be read. */
export function parseDraft(raw: string | null, now: number): TicketDraft | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as Partial<TicketDraft>;
    if (typeof d.savedAt !== "number" || now - d.savedAt > DRAFT_MAX_AGE_MS) return null;
    if (!d.fields || typeof d.fields !== "object" || !Array.isArray(d.files)) return null;
    const fields: Record<string, string> = {};
    for (const k of DRAFT_FIELDS) {
      const v = (d.fields as Record<string, unknown>)[k];
      if (typeof v === "string") fields[k] = v;
    }
    const draft = { savedAt: d.savedAt, fields, files: d.files.filter(isFile).filter((f) => now - f.uploadedAt < DRAFT_MAX_AGE_MS).map((f) => ({ ...f, durationSec: f.durationSec ?? null })) };
    return isEmptyDraft(draft) ? null : draft;
  } catch {
    return null;
  }
}

/** A first guess at the Device type dropdown, from the browser. */
export function guessDevice(userAgent: string, touchPoints: number): DeviceType {
  if (/iPhone|iPod/.test(userAgent)) return "IPHONE";
  if (/iPad/.test(userAgent) || (/Macintosh/.test(userAgent) && touchPoints > 1)) return "TABLET";
  if (/Android/.test(userAgent)) return /Mobile/.test(userAgent) ? "ANDROID" : "TABLET";
  return "COMPUTER";
}

export const isDeviceType = (v: string | null): v is DeviceType => DEVICE_TYPES.includes(v as DeviceType);
