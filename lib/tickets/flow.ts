// The progress tracker on each ticket: where it is on the main path New → In progress → Fixed → Closed (QA verifies and
// closes in one move; a ticket already Verified shows on the Fixed step),
// when each step was reached, and whose move it is now. Side states (Needs info, Reopened, Rejected…) are shown on
// the step they belong to. Pure function, unit-tested.

import { isDone, STATUS_LABELS, type TicketStatus } from "./workflow";

const PATH = ["NEW", "IN_PROGRESS", "FIXED", "CLOSED"] as const;
type PathStatus = (typeof PATH)[number];

const STEP_LABELS: Record<PathStatus, string> = { NEW: "Filed", IN_PROGRESS: "In progress", FIXED: "Fixed", CLOSED: "Closed" };

/** Which step of the main path each status sits on. */
const STEP_OF: Record<TicketStatus, number> = {
  NEW: 0,
  IN_PROGRESS: 1,
  NEED_INFO: 1,
  REOPENED: 1,
  FIXED: 2,
  VERIFIED: 2,
  CLOSED: 3,
  REJECTED: 3,
  DUPLICATE: 3,
  WONT_FIX: 3,
};

export type FlowStepState = "done" | "current" | "upcoming" | "skipped";
export type FlowTone = "acc" | "warn" | "bad" | "ok" | "neutral";
export type FlowStep = { key: string; label: string; state: FlowStepState; tone: FlowTone; at: Date | null };
export type Flow = {
  steps: FlowStep[];
  /** Whose move it is, or null once the ticket is finished. */
  next: { who: string | null; side: "developer" | "qa"; action: string } | null;
};

export type FlowInput = {
  status: TicketStatus;
  createdAt: Date;
  closedAt: Date | null;
  events: { kind: string; from: string | null; to: string | null; createdAt: Date }[];
  reporter: { name: string };
  assignee: { name: string } | null;
};

export function ticketFlow(t: FlowInput): Flow {
  const statusEvents = t.events.filter((e) => e.kind === "STATUS");
  /** When the ticket last entered `status`. */
  const reached = (status: string): Date | null => {
    if (status === "NEW") return t.createdAt;
    const last = statusEvents.filter((e) => e.to === status).at(-1);
    return last?.createdAt ?? null;
  };

  const current = STEP_OF[t.status];
  const endedEarly = isDone(t.status) && t.status !== "CLOSED";
  // A ticket rejected or closed as a duplicate skips the steps between where it was and the end.
  const lastReal = endedEarly ? STEP_OF[(statusEvents.at(-1)?.from as TicketStatus) ?? "NEW"] ?? 0 : current;

  const steps: FlowStep[] = PATH.map((key, i): FlowStep => {
    const base = { key, label: STEP_LABELS[key], tone: "acc" as FlowTone };
    if (endedEarly) {
      if (i === PATH.length - 1) return { ...base, key: t.status, label: STATUS_LABELS[t.status], state: "done", tone: "neutral", at: t.closedAt ?? reached(t.status) };
      if (i <= lastReal) return { ...base, state: "done", at: reached(key) };
      return { ...base, state: "skipped", at: null };
    }
    if (t.status === "CLOSED") return { ...base, state: "done", tone: i === PATH.length - 1 ? "ok" : "acc", at: reached(key) };
    if (i < current) return { ...base, state: "done", at: reached(key) };
    if (i > current) return { ...base, state: "upcoming", at: null };
    // The current step, which may be a side state of it.
    if (t.status === "NEED_INFO") return { ...base, label: STATUS_LABELS.NEED_INFO, state: "current", tone: "warn", at: reached("NEED_INFO") };
    if (t.status === "REOPENED") return { ...base, label: STATUS_LABELS.REOPENED, state: "current", tone: "bad", at: reached("REOPENED") };
    if (t.status === "VERIFIED") return { ...base, label: STATUS_LABELS.VERIFIED, state: "current", tone: "ok", at: reached("VERIFIED") };
    return { ...base, state: "current", tone: t.status === "FIXED" ? "ok" : "acc", at: reached(key) };
  });

  const dev = t.assignee?.name ?? null;
  const qa = t.reporter.name;
  const next: Flow["next"] =
    t.status === "NEW" || t.status === "REOPENED"
      ? dev
        ? { who: dev, side: "developer", action: "start work" }
        : { who: qa, side: "qa", action: "pick a developer" }
      : t.status === "IN_PROGRESS"
        ? { who: dev, side: "developer", action: "fix it and mark it fixed" }
        : t.status === "NEED_INFO"
          ? { who: qa, side: "qa", action: "answer the developer's question" }
          : t.status === "FIXED"
            ? { who: qa, side: "qa", action: "retest the fix, then verify and close it" }
            : t.status === "VERIFIED"
              ? { who: qa, side: "qa", action: "close the ticket" }
              : null;

  return { steps, next };
}

/** The Next step box on a ticket: a short title and a sentence, written for the person reading it. */
export function nextStep(t: FlowInput, viewer: { isReporter: boolean; isAssignee: boolean }): { title: string; text: string } {
  const { next } = ticketFlow(t);
  if (!next) return { title: "Finished", text: "Nobody needs to do anything unless it's reopened." };

  const dev = t.assignee?.name ?? "The developer";
  const mine = next.side === "qa" ? viewer.isReporter : viewer.isAssignee;
  if (t.status === "VERIFIED") return { title: "Verified, ready to close", text: "The retest passed. This ticket can now be closed." };
  if (t.status === "FIXED" && mine) return { title: "Your move: retest this fix", text: `${dev} marked this as fixed. Check it in the ERP, then verify and close it, or reopen it.` };
  if (t.status === "REOPENED" && t.assignee && !mine) {
    return { title: `${dev}’s move`, text: viewer.isReporter ? "You reopened this ticket. It returns to the developer." : "This ticket was reopened. It returns to the developer." };
  }
  if (mine) return { title: "Your move", text: `${next.action[0].toUpperCase()}${next.action.slice(1)}.` };
  const who = next.who ?? "the developer";
  return {
    title: next.who ? `${next.who}’s move` : "The developer’s move",
    text: `Waiting on ${who} (${next.side === "qa" ? "QA" : "developer"}) to ${next.action}.`,
  };
}
