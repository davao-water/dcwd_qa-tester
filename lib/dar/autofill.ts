// Fills a DAR's day cells from what the person did in QA Hub, one entry per ticket ("Filed #123 PDS layout; retested
// #118 NSC form"). Rows marked "fill from my ticket work" can be linked to modules: work on a ticket in a linked module (or
// anything inside it) goes to that row; a fill row with no modules takes the rest. Work outside the person's work hours is
// marked "After hours: …". Cells nobody wrote in start as REST DAY on days off and "-" on work days. What QA Hub writes is
// merged into the cell, never over what the person typed. Pure functions, unit-tested.

import { inWorkHours } from "@/lib/push/recipients";
import { isOffStatus, type DarDays } from "./attendance";
import { isDayOff } from "./holidays";
import { manilaDay, type PeriodDay } from "./period";
import type { DarFunction } from "./template";

export const REST_DAY = "REST DAY";
/** A work day with nothing done in that row, as the paper form writes it. */
export const NO_ENTRY = "-";
const AFTER_HOURS = "After hours:";

/** What an empty cell starts as by the calendar alone: REST DAY on weekends and holidays, "-" on work days. */
export const defaultEntry = (day: { date: string }) => (isDayOff(day.date) ? REST_DAY : NO_ENTRY);

/** What an empty cell starts as for a day with a status: REST DAY on a day off, "-" otherwise. */
export function statusDefaults(days: DarDays, period: PeriodDay[]): string[] {
  return period.map(({ date }) => (days[date] && isOffStatus(days[date].status) ? REST_DAY : NO_ENTRY));
}

/** The area of a ticket, with the modules it sits inside (up to the top). */
export type AreaWithCode = { name: string; code: string | null; parent?: AreaWithCode | null };

/** The module as written for an area: its Code, else the nearest Code of a module it sits inside, else its name. */
export function areaLabel(area: AreaWithCode): string {
  for (let at: AreaWithCode | null | undefined = area; at; at = at.parent) if (at.code?.trim()) return at.code.trim();
  return area.name;
}

/** One cell per day per function row. */
export type DarCells = { core: string[][]; support: string[][] };

/** The longest a day's entry may be: room for a few tasks, as people write them on the paper form. */
export const CELL_MAX = 500;

// ---------------------------------------------------------------------------------------------------------------------
// What the person did

/** Something the person did on a ticket: when, the ticket's area, and the verb for it ("filed", "replied on"…). */
export type TicketAction = { at: Date; areaId: string | null; number: number; title: string; verb: string };

/**
 * The verb for a timeline event the person made, or null for one that isn't worth a line (a category tag). Closing a
 * fixed ticket is verifying it; closing a new one is withdrawing it.
 */
export function verbFor(e: { kind: string; from: string | null; to: string | null; note?: string | null }): string | null {
  if (e.kind === "STATUS") {
    switch (e.to) {
      case "IN_PROGRESS":
        return e.from === "NEED_INFO" ? "resumed" : e.from === "FIXED" ? "reworked" : "started";
      case "FIXED":
        return "fixed";
      case "NEED_INFO":
        return "asked for info on";
      case "VERIFIED":
        return "verified";
      case "CLOSED":
        return e.from === "FIXED" || e.from === "VERIFIED" ? "verified and closed" : "withdrew";
      case "REOPENED":
        return "reopened";
      case "WONT_FIX":
        return "marked won't fix";
      case "REJECTED":
        return "marked not a bug";
      case "DUPLICATE":
        return "marked duplicate";
      case "NEW":
        return null; // Stop work, or the status part of a hand-back: the ASSIGNEE event says it.
      default:
        return null;
    }
  }
  if (e.kind === "ASSIGNEE") return e.to ? "assigned" : e.note ? "handed back" : "unassigned";
  if (e.kind === "FIELD") return "updated";
  return null;
}

const clip = (s: string, n: number) => {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > n ? `${one.slice(0, n - 1).trimEnd()}…` : one;
};

/** How many tickets a cell names before "+N more". */
const TICKETS_PER_CELL = 3;

/** "Filed & replied on #123 PDS layout; retested #118 NSC form; +2 more", in the order things happened. */
export function describe(actions: TicketAction[]): string {
  const byTicket = new Map<number, { title: string; verbs: string[] }>();
  for (const a of [...actions].sort((x, y) => x.at.getTime() - y.at.getTime())) {
    const t = byTicket.get(a.number) ?? { title: a.title, verbs: [] };
    if (!t.verbs.includes(a.verb)) t.verbs.push(a.verb);
    byTicket.set(a.number, t);
  }
  const parts = [...byTicket.entries()].map(([n, t]) => `${t.verbs.join(" & ")} #${n} ${clip(t.title, 32)}`);
  const shown = parts.slice(0, TICKETS_PER_CELL);
  if (parts.length > TICKETS_PER_CELL) shown.push(`+${parts.length - TICKETS_PER_CELL} more`);
  const text = shown.join("; ");
  return text ? text[0].toUpperCase() + text.slice(1) : "";
}

export type WorkTime = { workStartMin: number; workEndMin: number; workDays: number };

/** A function row's place in the matching: linked to modules, a catch-all, or not filled at all. */
const linked = (f: DarFunction) => !!f.autofill && !!f.areaIds?.length;
const catchAll = (f: DarFunction) => !!f.autofill && !f.areaIds?.length;

/**
 * What QA Hub writes in each fill row on each day, from the person's ticket actions. `chainOf(areaId)` is the area and
 * the modules above it, nearest first: the row linked to the nearest one wins (Procurement › Purchase Requisition goes to
 * a row linked to Purchase Requisition before one linked to Procurement). Unlinked work goes to every catch-all row.
 * Rows that don't fill from tickets, and days with nothing, get "".
 */
export function autoCells(
  fns: { core: DarFunction[]; support: DarFunction[] },
  actions: TicketAction[],
  period: PeriodDay[],
  chainOf: (areaId: string) => string[],
  work: WorkTime,
): DarCells {
  const rows = [...fns.core.map((f, i) => ({ f, section: "core" as const, i })), ...fns.support.map((f, i) => ({ f, section: "support" as const, i }))];
  const dayIndex = new Map(period.map((d, i) => [d.date, i]));
  // Per row, per day: what was done in work hours and after.
  const bucket = new Map<string, { inHours: TicketAction[]; after: TicketAction[] }>();
  const add = (section: string, row: number, day: number, a: TicketAction, after: boolean) => {
    const key = `${section}:${row}:${day}`;
    const b = bucket.get(key) ?? { inHours: [], after: [] };
    (after ? b.after : b.inHours).push(a);
    bucket.set(key, b);
  };

  for (const a of actions) {
    const day = dayIndex.get(manilaDay(a.at));
    if (day === undefined) continue;
    const chain = a.areaId ? chainOf(a.areaId) : [];
    let targets = [] as typeof rows;
    for (const id of chain) {
      const hit = rows.find((r) => linked(r.f) && r.f.areaIds!.includes(id));
      if (hit) {
        targets = [hit];
        break;
      }
    }
    if (!targets.length) targets = rows.filter((r) => catchAll(r.f));
    const after = !inWorkHours(work, a.at);
    for (const r of targets) add(r.section, r.i, day, a, after);
  }

  const cell = (section: string, row: number, day: number) => {
    const b = bucket.get(`${section}:${row}:${day}`);
    if (!b) return "";
    const inHours = describe(b.inHours);
    const after = b.after.length ? `${AFTER_HOURS} ${describe(b.after)}` : "";
    return [inHours, after].filter(Boolean).join(" · ").slice(0, CELL_MAX);
  };
  return {
    core: fns.core.map((_, i) => period.map((_, d) => cell("core", i, d))),
    support: fns.support.map((_, i) => period.map((_, d) => cell("support", i, d))),
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Cells

/** Fresh cells: every cell starts with its day's default (REST DAY or "-"), or "" when no defaults are given (a shape). */
export function buildCells(fns: { core: DarFunction[]; support: DarFunction[] }, defaults: string[]): DarCells {
  const row = () => [...defaults];
  return { core: fns.core.map(row), support: fns.support.map(row) };
}

/** Empty cells (an import's blank days) take their day's default. */
export function fillDefaults(cells: DarCells, defaults: string[]): DarCells {
  const fill = (rows: string[][]) => rows.map((r) => r.map((v, j) => (v.trim() ? v : (defaults[j] ?? v))));
  return { core: fill(cells.core), support: fill(cells.support) };
}

/**
 * Saved cells shaped to the current functions and days: rows added or removed in the template since, or a bad
 * stored value, never break the page. Rows the saved draft doesn't have yet start from `fresh`.
 */
export function fitCells(saved: unknown, fresh: DarCells): DarCells {
  const s = (saved ?? {}) as Partial<Record<keyof DarCells, unknown>>;
  const fit = (rows: unknown, fallback: string[][]) =>
    fallback.map((fb, i) => {
      const r = Array.isArray(rows) ? rows[i] : undefined;
      return Array.isArray(r) ? fb.map((_, j) => (typeof r[j] === "string" ? (r[j] as string).slice(0, CELL_MAX) : "")) : fb;
    });
  return { core: fit(s.core, fresh.core), support: fit(s.support, fresh.support) };
}

export const isRestDay = (cell: string) => /^rest\s*day$/i.test(cell.trim());
/** A cell that says nothing was done: empty, or dashes. */
export const isNoEntry = (cell: string) => /^[-–—\s]*$/.test(cell);

/**
 * Puts what QA Hub wrote now (`fresh`) into a cell without touching what the person typed. `before` is what QA Hub
 * wrote last time, so an updated entry replaces the old one instead of being added twice:
 * - a "-" or empty cell gets the entry; a REST DAY cell gets "REST DAY · <entry>";
 * - the earlier entry, wherever it sits in the cell, is swapped for the new one;
 * - otherwise the entry goes after what's written, once.
 */
export function mergeCell(current: string, before: string, fresh: string): string {
  if (!fresh) return current;
  if (current.includes(fresh)) return current;
  if (before && current.includes(before)) return current.replace(before, fresh).slice(0, CELL_MAX);
  if (isNoEntry(current)) return fresh;
  if (isRestDay(current)) return `${REST_DAY} · ${fresh}`.slice(0, CELL_MAX);
  return `${current.trimEnd()}; ${fresh}`.slice(0, CELL_MAX);
}

export function mergeCells(current: DarCells, before: DarCells, fresh: DarCells): DarCells {
  const merge = (cur: string[][], b: string[][], f: string[][]) => cur.map((r, i) => r.map((v, j) => mergeCell(v, b[i]?.[j] ?? "", f[i]?.[j] ?? "")));
  return { core: merge(current.core, before.core, fresh.core), support: merge(current.support, before.support, fresh.support) };
}
