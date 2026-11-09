// A DAR's day statuses (Present, Rest day, Leave…) and reading the attendance log copied from the ERP. "Actual No. of
// Days Attended" counts Present days. Work is on-site; Remote is for a crisis and isn't counted. Pure functions, unit-tested.
//
// QA Hub never sees the ERP: the person copies their log inquiry rows and pastes them. Only each day's first time-in,
// last time-out and where are kept; names, employee numbers and device codes are dropped.

import { holidayOn } from "./holidays";
import type { PeriodDay } from "./period";

export const DAY_STATUSES = ["PRESENT", "REMOTE", "REST", "HOLIDAY", "LEAVE", "ABSENT", "UPCOMING"] as const;
export type DayStatus = (typeof DAY_STATUSES)[number];

export const DAY_STATUS_LABELS: Record<DayStatus, string> = {
  PRESENT: "Present",
  REMOTE: "Remote (crisis)",
  REST: "Rest day",
  HOLIDAY: "Holiday",
  LEAVE: "Leave",
  ABSENT: "Absent",
  UPCOMING: "Not yet",
};

/** The statuses a person can pick for a day (Not yet is only the default for days still to come). */
export const PICKABLE_STATUSES: readonly DayStatus[] = ["PRESENT", "REMOTE", "LEAVE", "ABSENT", "REST", "HOLIDAY"];

/** One day: its status and, from a pasted log, the first time-in and last time-out ("08:06 AM"). */
export type DarDay = { status: DayStatus; in?: string; out?: string; where?: string };
/** By date ("2026-11-03"). */
export type DarDays = Record<string, DarDay>;

/** Days off: their cells start as REST DAY. */
export const isOffStatus = (s: DayStatus) => s === "REST" || s === "HOLIDAY";

/** Whether `date` is one of the person's work days (`workDays`: bit 0 = Sunday … bit 6 = Saturday, as in My account). */
export function isWorkDay(date: string, workDays: number): boolean {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
  return (workDays & (1 << dow)) !== 0;
}

/** Before anything is set: holidays, then days off, then days still to come, then Present. */
export function defaultDays(days: PeriodDay[], workDays: number, today: string): DarDays {
  return Object.fromEntries(
    days.map(({ date }) => {
      const status: DayStatus = holidayOn(date) ? "HOLIDAY" : !isWorkDay(date, workDays) ? "REST" : date > today ? "UPCOMING" : "PRESENT";
      return [date, { status }];
    }),
  );
}

const TIME = /^\d{1,2}:\d{2}(?::\d{2})? ?[AP]M$/i;
const clip = (s: unknown, n: number) => (typeof s === "string" ? s.slice(0, n) : undefined);

/** Saved days shaped to the period: unknown statuses and days outside it fall back to the defaults. */
export function fitDays(saved: unknown, defaults: DarDays): DarDays {
  const s = (saved && typeof saved === "object" ? saved : {}) as Record<string, Partial<DarDay>>;
  return Object.fromEntries(
    Object.entries(defaults).map(([date, d]) => {
      const v = s[date];
      if (!v || !(DAY_STATUSES as readonly string[]).includes(v.status as string)) return [date, d];
      const day: DarDay = { status: v.status as DayStatus };
      if (typeof v.in === "string" && TIME.test(v.in)) day.in = v.in;
      if (typeof v.out === "string" && TIME.test(v.out)) day.out = v.out;
      const where = clip(v.where, 80);
      if (where) day.where = where;
      return [date, day];
    }),
  );
}

/** "Actual No. of Days Attended": the Present days. */
export const attendedCount = (days: DarDays) => Object.values(days).filter((d) => d.status === "PRESENT").length;

// ---------------------------------------------------------------------------------------------------------------------
// Pasted attendance log

export type LogDay = { date: string; in: string | null; out: string | null; where: string | null; taps: number };

const DATE = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/;
const TIME_IN_TEXT = /\b(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP])\.?M\.?\b/i;
const FLAG = /\b(In|Out)\b/;
const PLACE = /\b[A-Z]{2,5}\d{2,4}\s*-\s*[^\t\n]{2,60}/;

const pad = (n: number) => String(n).padStart(2, "0");
const minutesOf = (h: number, m: number, ap: string) => ((h % 12) + (ap.toUpperCase() === "P" ? 12 : 0)) * 60 + m;
const label = (min: number) => {
  const h = Math.floor(min / 60);
  return `${pad(((h + 11) % 12) + 1)}:${pad(min % 60)} ${h < 12 ? "AM" : "PM"}`;
};

/**
 * Reads the rows copied from the ERP's log inquiry (or any text with a date, a time and In/Out per record). A record is
 * the date line, then the line with the time and its flag; the location after it is kept if found. Repeated taps
 * count once: each day keeps its first time-in and last time-out.
 */
export function parseAttendance(text: string): LogDay[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n").map((l) => l.trim()).filter(Boolean);
  const byDate = new Map<string, { ins: number[]; outs: number[]; where: string | null; taps: number }>();
  let date: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const d = DATE.exec(line);
    if (d) {
      const [, mm, dd, yyyy] = d;
      const month = Number(mm);
      const day = Number(dd);
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) date = `${yyyy}-${pad(month)}-${pad(day)}`;
    }
    const t = TIME_IN_TEXT.exec(line);
    const f = FLAG.exec(line.replace(TIME_IN_TEXT, ""));
    if (!date || !t || !f) continue;
    const min = minutesOf(Number(t[1]), Number(t[2]), t[4]);
    const entry = byDate.get(date) ?? { ins: [], outs: [], where: null, taps: 0 };
    (f[1] === "In" ? entry.ins : entry.outs).push(min);
    entry.taps++;
    // The location is usually two lines on ("BIO", then "AMS024 - 4th Floor").
    for (let j = i; j <= Math.min(lines.length - 1, i + 3) && !entry.where; j++) {
      const p = PLACE.exec(lines[j]);
      if (p) entry.where = p[0].trim();
    }
    byDate.set(date, entry);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, e]) => ({
      date: day,
      in: e.ins.length ? label(Math.min(...e.ins)) : null,
      out: e.outs.length ? label(Math.max(...e.outs)) : null,
      where: e.where,
      taps: e.taps,
    }));
}

/** What a pasted log does to a period: each day's new status, and the work days with no time-in, for the person to settle. */
export type AttendancePlan = { days: DarDays; present: string[]; noLog: string[]; outside: number };

/**
 * Applies a pasted log to the period's days. A day with a time-in is Present (with its times). A work day with no log,
 * on or before the last day the log covers, becomes Absent and is listed in `noLog`, so the person can change it to
 * Leave or Remote. Holidays, days off and days after the log stay as they are. `outside`: logged days not in this period.
 */
export function applyAttendance(current: DarDays, logs: LogDay[], workDays: number): AttendancePlan {
  const dates = Object.keys(current).sort();
  const inPeriod = logs.filter((l) => l.date in current);
  const last = inPeriod.at(-1)?.date ?? null;
  const byDate = new Map(inPeriod.map((l) => [l.date, l]));
  const present: string[] = [];
  const noLog: string[] = [];
  const days: DarDays = {};
  for (const date of dates) {
    const log = byDate.get(date);
    const now = current[date];
    if (log?.in || log?.out) {
      present.push(date);
      days[date] = { status: "PRESENT", ...(log.in ? { in: log.in } : {}), ...(log.out ? { out: log.out } : {}), ...(log.where ? { where: log.where } : {}) };
    } else if (last && date <= last && isWorkDay(date, workDays) && !holidayOn(date) && now.status !== "LEAVE" && now.status !== "REMOTE") {
      noLog.push(date);
      days[date] = { status: "ABSENT" };
    } else days[date] = now;
  }
  return { days, present, noLog, outside: logs.length - inPeriod.length };
}
