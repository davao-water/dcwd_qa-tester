import { rootOf } from "@/lib/areas/tree";
import { TICKET_CATEGORIES, type TicketCategoryValue, type TicketStatus } from "./workflow";

// Module progress: for each top-level module, the share of its tickets in each category that are closed, and one fair
// score for the whole module. Counted from the tickets every time, never saved (docs/design/ui-web-rework/README.md).

/** Statuses that leave a ticket out of both numbers. */
const LEFT_OUT: readonly TicketStatus[] = ["REJECTED", "DUPLICATE", "WONT_FIX"];

/** A Closed ticket whose last move came from one of these was withdrawn by its reporter, not fixed. */
const WITHDRAWN_FROM = ["NEW", "NEED_INFO"];

/**
 * A module needs this many tickets before its score counts fully. Below it, each missing ticket counts as not done,
 * so 1 closed ticket out of 1 scores 20%, not 100% (HANDOFF D19).
 */
export const MIN_TICKETS = 5;

export type ProgressArea = { id: string; name: string; parentId: string | null; active: boolean };
export type ProgressTicket = {
  areaId: string | null;
  category: TicketCategoryValue | null;
  status: TicketStatus;
  /** For a Closed ticket: the status its latest STATUS event came from. */
  closedFrom?: string | null;
};

export type Progress = { done: number; total: number; pct: number };
export type ModuleProgress = {
  id: string;
  name: string;
  /** The fair score for the whole module: its tagged tickets, with full credit only from MIN_TICKETS on. */
  score: Progress;
  /** Plain closed ÷ total per category; 0 of 0 shows as 0%. */
  categories: Record<TicketCategoryValue, Progress>;
  untagged: number;
};

/** Whether a ticket counts at all. */
export function counts(t: ProgressTicket): boolean {
  if (LEFT_OUT.includes(t.status)) return false;
  if (t.status === "CLOSED" && t.closedFrom && WITHDRAWN_FROM.includes(t.closedFrom)) return false;
  return true;
}

/** Rounded down, so 100% only means everything is closed. 0 of 0 is 0%. */
export const percent = (done: number, total: number) => (total ? Math.floor((done * 100) / total) : 0);

/** The module score: closed ÷ the larger of (total, MIN_TICKETS), rounded down. */
export const fairScore = (done: number, total: number) => percent(done, Math.max(total, MIN_TICKETS));

/** One card per active top-level module, lowest score first, then by name; modules with no counted tickets last. */
export function moduleProgress(areas: ProgressArea[], tickets: ProgressTicket[]): ModuleProgress[] {
  const tops = areas.filter((a) => a.parentId === null && a.active);
  // Every area counts towards its top-level module, however deep it sits.
  const topOf = new Map(areas.map((a) => [a.id, rootOf(areas, a.id)]));

  const tally = new Map(tops.map((a) => [a.id, { untagged: 0, done: {} as Record<string, number>, total: {} as Record<string, number> }]));
  for (const t of tickets) {
    if (!t.areaId || !counts(t)) continue;
    const top = topOf.get(t.areaId);
    const row = top ? tally.get(top) : undefined;
    if (!row) continue;
    if (!t.category) {
      row.untagged++;
      continue;
    }
    row.total[t.category] = (row.total[t.category] ?? 0) + 1;
    if (t.status === "CLOSED") row.done[t.category] = (row.done[t.category] ?? 0) + 1;
  }

  const cards = tops.map((a): ModuleProgress => {
    const row = tally.get(a.id)!;
    const categories = Object.fromEntries(
      TICKET_CATEGORIES.map((c) => {
        const total = row.total[c] ?? 0;
        const done = row.done[c] ?? 0;
        return [c, { done, total, pct: percent(done, total) }];
      }),
    ) as Record<TicketCategoryValue, Progress>;
    const done = TICKET_CATEGORIES.reduce((n, c) => n + categories[c].done, 0);
    const total = TICKET_CATEGORIES.reduce((n, c) => n + categories[c].total, 0);
    return { id: a.id, name: a.name, score: { done, total, pct: fairScore(done, total) }, categories, untagged: row.untagged };
  });

  return cards.sort((x, y) => {
    const ex = x.score.total === 0;
    const ey = y.score.total === 0;
    if (ex !== ey) return ex ? 1 : -1;
    if (x.score.pct !== y.score.pct) return x.score.pct - y.score.pct;
    return x.name.localeCompare(y.name);
  });
}

/** Keeps the modules a person belongs to, directly or through anything inside it. */
export function memberModules(areas: ProgressArea[], memberAreaIds: string[]): Set<string> {
  const topOf = new Map(areas.map((a) => [a.id, rootOf(areas, a.id)]));
  return new Set(memberAreaIds.map((id) => topOf.get(id)).filter((id): id is string => !!id));
}

export type ProgressTone = "none" | "low" | "mid" | "good" | "done";

/** One colour scale for scores and rows: 0 grey, 1–29 red, 30–59 yellow, 60–89 blue, 90–100 green (HANDOFF D19). */
export const progressTone = (pct: number): ProgressTone => (pct <= 0 ? "none" : pct < 30 ? "low" : pct < 60 ? "mid" : pct < 90 ? "good" : "done");
