// Ticket statuses, labels and the status workflow: who may move a ticket from which status to which.
// Pure functions, unit-tested. The permission matrix decides the role; these rules add per-ticket checks.

import type { Tone } from "@/components/status-pill";
import { can, type Role } from "@/lib/auth/permissions";

export const TICKET_TYPES = ["BUG", "SUGGESTION", "IMPROVEMENT"] as const;
export type TicketType = (typeof TICKET_TYPES)[number];

export const TICKET_STATUSES = ["NEW", "IN_PROGRESS", "NEED_INFO", "FIXED", "VERIFIED", "CLOSED", "REOPENED", "REJECTED", "DUPLICATE", "WONT_FIX"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const SEVERITIES = ["S1", "S2", "S3", "S4"] as const;
export type SeverityValue = (typeof SEVERITIES)[number];

export const DEVICE_TYPES = ["COMPUTER", "ANDROID", "IPHONE", "TABLET"] as const;
export type DeviceType = (typeof DEVICE_TYPES)[number];

export const TICKET_CATEGORIES = ["FRONT_END", "BACK_END", "UI_UX"] as const;
export type TicketCategoryValue = (typeof TICKET_CATEGORIES)[number];
export const CATEGORY_LABELS: Record<TicketCategoryValue, string> = { FRONT_END: "Front-end", BACK_END: "Back-end", UI_UX: "UI/UX" };
/** What a ticket with no category shows. Tickets filed before Category existed have none until someone tags them. */
export const NO_CATEGORY = "Not tagged yet";

export const TYPE_LABELS: Record<TicketType, string> = { BUG: "Bug", SUGGESTION: "Suggestion", IMPROVEMENT: "Improvement" };

/** The colour each type is shown in: Bug red, Suggestion amber, Improvement blue (the --type-* tokens in globals.css). */
export type TypeTone = "bug" | "sug" | "imp";
export const TYPE_TONES: Record<TicketType, TypeTone> = { BUG: "bug", SUGGESTION: "sug", IMPROVEMENT: "imp" };

export const STATUS_LABELS: Record<TicketStatus, string> = {
  NEW: "New",
  IN_PROGRESS: "In progress",
  NEED_INFO: "Needs info",
  FIXED: "Fixed",
  VERIFIED: "Verified",
  CLOSED: "Closed",
  REOPENED: "Reopened",
  REJECTED: "Rejected",
  DUPLICATE: "Duplicate",
  WONT_FIX: "Won't fix",
};

export const STATUS_TONES: Record<TicketStatus, Tone> = {
  NEW: "neutral",
  IN_PROGRESS: "acc",
  NEED_INFO: "warn",
  FIXED: "ok",
  VERIFIED: "ok",
  CLOSED: "neutral",
  REOPENED: "bad",
  REJECTED: "neutral",
  DUPLICATE: "neutral",
  WONT_FIX: "neutral",
};

export const SEVERITY_LABELS: Record<SeverityValue, string> = { S1: "S1 Critical", S2: "S2 Major", S3: "S3 Minor", S4: "S4 Trivial" };

export const DEVICE_LABELS: Record<DeviceType, string> = { COMPUTER: "Computer", ANDROID: "Android phone", IPHONE: "iPhone", TABLET: "Tablet" };
/** Where a problem was found. Older tickets may hold free text from before this was a choice. */
export const FOUND_IN = ["Dev", "Staging", "Production"] as const;

/** The Found in choices, plus what an older ticket already says, so editing it doesn't lose that. */
export function foundInOptions(current: string): string[] {
  return current && !(FOUND_IN as readonly string[]).includes(current) ? [...FOUND_IN, current] : [...FOUND_IN];
}

export const PRIORITIES = ["P1", "P2", "P3", "P4"] as const;
export const PRIORITY_LABELS = { P1: "P1 Urgent", P2: "P2 High", P3: "P3 Normal", P4: "P4 Low" } as const;

/** Statuses that end a ticket. `closedAt` is set when a ticket enters one and cleared when it is reopened. */
export const DONE_STATUSES: readonly TicketStatus[] = ["CLOSED", "REJECTED", "DUPLICATE", "WONT_FIX"];

/** The status filter value for tickets nobody has started: new or reopened. */
export const TO_START = "TO_START";
export const TO_START_STATUSES: readonly TicketStatus[] = ["NEW", "REOPENED"];
export const OPEN_STATUSES: readonly TicketStatus[] = TICKET_STATUSES.filter((s) => !DONE_STATUSES.includes(s));
export const isDone = (s: TicketStatus) => DONE_STATUSES.includes(s);

export type Actor = { id: string; role: Role };
export type TicketRef = { status: TicketStatus; reporterId: string; assigneeId: string | null };

/**
 * A person's own tickets (their "work"): admins every ticket, QA testers the tickets they filed, developers the tickets
 * assigned to them. Applied to the list's own tabs, the dashboard, the inbox, notifications and every change.
 * Reading is wider: see canReadTicket.
 */
export type TicketScope = "all" | { reporterId: string } | { assigneeId: string };

export function ticketScope(u: Actor): TicketScope {
  if (can(u, "tickets.viewAll")) return "all";
  return u.role === "QA" ? { reporterId: u.id } : { assigneeId: u.id };
}

export function canSeeTicket(t: TicketRef, u: Actor): boolean {
  const s = ticketScope(u);
  if (s === "all") return true;
  return "reporterId" in s ? t.reporterId === s.reporterId : t.assigneeId === s.assigneeId;
}

/**
 * Whether a person may open any ticket (the All tab): everyone who may view tickets. They can read it, see its files and
 * reply; changing it still needs canSeeTicket plus the per-ticket rules below.
 */
export const canReadTicket = (u: Actor) => can(u, "tickets.view");

/** The assigned developer, or an admin. */
const devSide = (t: TicketRef, u: Actor) => can(u, "tickets.resolve") && (u.role === "ADMIN" || t.assigneeId === u.id);
/** The QA tester who filed it (the only tester who sees it), or an admin. */
const qaSide = (t: TicketRef, u: Actor) => can(u, "tickets.verify") && (u.role === "ADMIN" || t.reporterId === u.id);
const reporter = (t: TicketRef, u: Actor) => t.reporterId === u.id || u.role === "ADMIN";

type Rule = {
  from: readonly TicketStatus[];
  to: TicketStatus;
  label: string;
  who: (t: TicketRef, u: Actor) => boolean;
  needsNote?: boolean;
  needsDuplicate?: boolean;
  /** Moves the ticket back a step, to correct a move made by mistake. Never the main button. */
  back?: boolean;
  /** What to write in the note, when the target status's usual hint doesn't fit. */
  hint?: string;
  /** Not a button of its own: a reason chosen inside this other move's dialog (Not a bug, inside Won't fix). */
  within?: TicketStatus;
};

const WORKING: readonly TicketStatus[] = ["NEW", "IN_PROGRESS", "REOPENED"];

// Order matters: it is the order of the buttons on the ticket page.
const RULES: Rule[] = [
  { from: ["NEW", "REOPENED"], to: "IN_PROGRESS", label: "Start work", who: devSide },
  { from: ["NEED_INFO"], to: "IN_PROGRESS", label: "Info added, resume", who: (t, u) => reporter(t, u) || devSide(t, u) },
  { from: WORKING, to: "FIXED", label: "Mark fixed", who: devSide },
  // Retesting passed: one step. (Verified on its own is gone; tickets already Verified close the same way.)
  { from: ["FIXED", "VERIFIED"], to: "CLOSED", label: "Verify and close", who: qaSide },
  { from: WORKING, to: "NEED_INFO", label: "Ask for info", who: devSide, needsNote: true },
  { from: ["FIXED", "VERIFIED", "CLOSED", "REJECTED", "DUPLICATE", "WONT_FIX"], to: "REOPENED", label: "Reopen", who: qaSide, needsNote: true },
  { from: [...WORKING, "NEED_INFO"], to: "DUPLICATE", label: "Duplicate", who: (t, u) => devSide(t, u) || qaSide(t, u), needsDuplicate: true },
  // Won't fix asks why: it can't be fixed (Won't fix), it isn't a bug (Rejected), or another developer should take it
  // (handBack in the store, which isn't a status move).
  { from: [...WORKING, "NEED_INFO"], to: "WONT_FIX", label: "Won't fix", who: devSide, needsNote: true },
  { from: [...WORKING, "NEED_INFO"], to: "REJECTED", label: "Not a bug", who: devSide, needsNote: true, within: "WONT_FIX" },
  { from: ["NEW", "NEED_INFO"], to: "CLOSED", label: "Withdraw", who: reporter, needsNote: true, hint: "Why you're withdrawing it." },
  // Back a step, for a move made by mistake. Each asks why, so the other side knows what happened.
  { from: ["IN_PROGRESS"], to: "NEW", label: "Stop work", who: devSide, needsNote: true, back: true, hint: "Why it goes back to To do, e.g. started the wrong ticket." },
  { from: ["FIXED"], to: "IN_PROGRESS", label: "Not fixed yet", who: devSide, needsNote: true, back: true, hint: "What still needs work, so QA doesn't retest yet." },
  { from: ["REJECTED", "WONT_FIX", "DUPLICATE"], to: "IN_PROGRESS", label: "Take back", who: devSide, needsNote: true, back: true, hint: "Why you're working on it after all." },
];

/** `within`: chosen inside that move's dialog rather than offered as its own button (see Rule). */
export type Transition = { to: TicketStatus; label: string; needsNote: boolean; needsDuplicate: boolean; back: boolean; hint?: string; within?: TicketStatus };

/** The moves `user` may make on this ticket now, one per target status. */
export function allowedTransitions(t: TicketRef, u: Actor): Transition[] {
  const seen = new Set<TicketStatus>();
  const out: Transition[] = [];
  for (const r of RULES) {
    if (seen.has(r.to) || !r.from.includes(t.status) || !r.who(t, u)) continue;
    seen.add(r.to);
    out.push({
      to: r.to,
      label: r.label,
      needsNote: !!r.needsNote,
      needsDuplicate: !!r.needsDuplicate,
      back: !!r.back,
      ...(r.hint ? { hint: r.hint } : {}),
      ...(r.within ? { within: r.within } : {}),
    });
  }
  return out;
}

/** Why the move is refused, or null when it is allowed. */
export function transitionError(t: TicketRef, u: Actor, input: { to: TicketStatus; note?: string | null; duplicateOf?: number | null }): string | null {
  const move = allowedTransitions(t, u).find((m) => m.to === input.to);
  if (!move) return `You can't move this ticket from ${STATUS_LABELS[t.status]} to ${STATUS_LABELS[input.to]}.`;
  if (move.needsNote && !input.note?.trim()) return "Add a note explaining why.";
  if (move.needsDuplicate && !input.duplicateOf) return "Enter the number of the ticket this duplicates.";
  return null;
}

/** Title, description, type, module, severity, priority and "found in": the QA tester who filed it, or an admin. */
export const canEditTicket = (t: TicketRef, u: Actor) => can(u, "tickets.create") && reporter(t, u);
/** Deleting is permanent, so the same people as editing. */
export const canDeleteTicket = (t: TicketRef, u: Actor) => can(u, "tickets.delete") && reporter(t, u);
export const canAssign = (u: Actor) => can(u, "tickets.assign");
/** Assigning this ticket: the QA tester who filed it, or an admin. Another tester only reads it from the All tab. */
export const canAssignTicket = (t: TicketRef, u: Actor) => canAssign(u) && reporter(t, u);
/** Correcting the category: the assigned developer once they've identified the problem, or an admin. */
/**
 * Handing a ticket back (Won't fix → "Another developer should take it"): the assigned developer, or an admin, while
 * it is still being worked on. It goes back to QA unassigned, with who they recommend.
 */
export const canHandBack = (t: TicketRef, u: Actor) => !!t.assigneeId && ([...WORKING, "NEED_INFO"] as TicketStatus[]).includes(t.status) && devSide(t, u);

export const canCategorize = (t: TicketRef, u: Actor) => can(u, "tickets.categorize") && (u.role === "ADMIN" || t.assigneeId === u.id);
