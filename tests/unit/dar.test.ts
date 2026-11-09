import { describe, expect, it } from "vitest";
import { applyAttendance, attendedCount, defaultDays, fitDays, parseAttendance } from "@/lib/dar/attendance";
import { areaLabel, autoCells, buildCells, defaultEntry, describe as describeActions, fillDefaults, fitCells, mergeCell, mergeCells, NO_ENTRY, REST_DAY, statusDefaults, verbFor } from "@/lib/dar/autofill";
import { easter, holidayOn, isDayOff } from "@/lib/dar/holidays";
import { darHtml } from "@/lib/dar/html";
import {
  longDate,
  manilaDay,
  parsePeriod,
  periodDays,
  periodFileLabel,
  periodFor,
  periodLabel,
  periodRange,
  previousPeriod,
  recentPeriods,
} from "@/lib/dar/period";
import type { DarReportData } from "@/lib/dar/store";
import { adoptLegacyTemplate, isEmptySetup, LEGACY_TEMPLATE, nameInitials, resolveHeader, type DarProfileRow } from "@/lib/dar/template";

describe("DAR periods", () => {
  it("splits each month at the 15th", () => {
    expect(periodFor("2026-10-15")).toEqual({ start: "2026-10-01", end: "2026-10-15" });
    expect(periodFor("2026-10-16")).toEqual({ start: "2026-10-16", end: "2026-10-31" });
    expect(periodFor("2026-11-30")).toEqual({ start: "2026-11-16", end: "2026-11-30" });
    expect(periodFor("2026-02-20")).toEqual({ start: "2026-02-16", end: "2026-02-28" });
    expect(periodFor("2028-02-20")).toEqual({ start: "2028-02-16", end: "2028-02-29" });
  });

  it("uses Manila dates, not the server's", () => {
    // 16:30 UTC on Oct 15 is already 00:30 on Oct 16 in Manila.
    expect(manilaDay(new Date("2026-10-15T16:30:00Z"))).toBe("2026-10-16");
    expect(periodFor(new Date("2026-10-15T16:30:00Z")).start).toBe("2026-10-16");
    const r = periodRange({ start: "2026-10-16", end: "2026-10-31" });
    expect(r.from.toISOString()).toBe("2026-10-15T16:00:00.000Z");
    expect(r.to.toISOString()).toBe("2026-10-31T16:00:00.000Z");
    expect(periodRange({ start: "2026-12-16", end: "2026-12-31" }).to.toISOString()).toBe("2026-12-31T16:00:00.000Z");
  });

  it("accepts only real period starts", () => {
    expect(parsePeriod("2026-10-16")).toEqual({ start: "2026-10-16", end: "2026-10-31" });
    // The 3rd and 18th start the other period days (3rd–17th / 18th–2nd); other days start nothing.
    expect(parsePeriod("2026-10-03")).toEqual({ start: "2026-10-03", end: "2026-10-17" });
    expect(parsePeriod("2026-10-05")).toBeNull();
    expect(parsePeriod("2026-13-01")).toBeNull();
    expect(parsePeriod("../etc")).toBeNull();
  });

  it("steps back across months and years", () => {
    expect(previousPeriod({ start: "2026-10-16", end: "2026-10-31" }).start).toBe("2026-10-01");
    expect(previousPeriod({ start: "2026-01-01", end: "2026-01-15" })).toEqual({ start: "2025-12-16", end: "2025-12-31" });
    expect(recentPeriods("2026-10-29", 3).map((p) => p.start)).toEqual(["2026-10-16", "2026-10-01", "2026-09-16"]);
  });

  it("lists the days with their weekday, and formats labels like the form", () => {
    const days = periodDays({ start: "2026-10-16", end: "2026-10-31" });
    expect(days).toHaveLength(16);
    expect(days[0]).toEqual({ date: "2026-10-16", month: "OCT", day: 16, dow: "FRI" });
    expect(days[2].dow).toBe("SUN");
    expect(periodLabel({ start: "2026-10-01", end: "2026-10-15" })).toBe("Oct 01, 2026 to Oct 15, 2026");
    expect(periodFileLabel({ start: "2026-10-16", end: "2026-10-31" })).toBe("Oct16-Oct31 2026");
    expect(longDate("2026-10-22")).toBe("October 22, 2026");
  });
});

describe("DAR auto-fill", () => {
  const days = periodDays({ start: "2026-10-01", end: "2026-10-15" });
  /** Manila time on an October 2026 day. */
  const at = (day: number, hour = 9, min = 0) => new Date(Date.UTC(2026, 9, day, hour - 8, min));
  const work = { workStartMin: 8 * 60, workEndMin: 17 * 60, workDays: 62 }; // Mon–Fri, 8:00–17:00
  // Procurement › Purchase Requisition › Approval, and HR.
  const parent: Record<string, string | null> = { proc: null, pr: "proc", ap: "pr", hr: null };
  const chainOf = (id: string) => {
    const out: string[] = [];
    for (let a: string | null = id; a; a = parent[a] ?? null) out.push(a);
    return out;
  };
  const act = (day: number, areaId: string | null, number: number, verb: string, hour = 9, title = `Ticket ${number}`) => ({ at: at(day, hour), areaId, number, title, verb });

  it("labels a module by its code, its module's code, then its name", () => {
    expect(areaLabel({ name: "Billing & Collection", code: "BCA", parent: null })).toBe("BCA");
    expect(areaLabel({ name: "Recruitment", code: null, parent: { name: "HR", code: "HR-RSP" } })).toBe("HR-RSP");
    expect(areaLabel({ name: "Payroll", code: null, parent: { name: "HR", code: null } })).toBe("Payroll");
    expect(areaLabel({ name: "Approval", code: null, parent: { name: "Purchase Requisition", code: null, parent: { name: "Procurement", code: "PROC" } } })).toBe("PROC");
  });

  it("names each event's action, and leaves out the ones not worth a line", () => {
    expect(verbFor({ kind: "STATUS", from: "NEW", to: "IN_PROGRESS" })).toBe("started");
    expect(verbFor({ kind: "STATUS", from: "NEED_INFO", to: "IN_PROGRESS" })).toBe("resumed");
    expect(verbFor({ kind: "STATUS", from: "FIXED", to: "CLOSED" })).toBe("verified and closed");
    expect(verbFor({ kind: "STATUS", from: "NEW", to: "CLOSED" })).toBe("withdrew");
    expect(verbFor({ kind: "STATUS", from: "FIXED", to: "REOPENED" })).toBe("reopened");
    expect(verbFor({ kind: "STATUS", from: "IN_PROGRESS", to: "REJECTED" })).toBe("marked not a bug");
    expect(verbFor({ kind: "STATUS", from: "IN_PROGRESS", to: "NEW" })).toBeNull();
    expect(verbFor({ kind: "ASSIGNEE", from: null, to: "Ben" })).toBe("assigned");
    expect(verbFor({ kind: "ASSIGNEE", from: "Ben", to: null, note: "Recommends Cy." })).toBe("handed back");
    expect(verbFor({ kind: "CATEGORY", from: null, to: null })).toBeNull();
  });

  it("writes one entry per ticket, actions joined, three tickets then a count", () => {
    expect(describeActions([act(1, null, 123, "filed", 9, "PDS layout misaligned"), act(1, null, 123, "replied on", 10, "PDS layout misaligned"), act(1, null, 118, "verified and closed", 11, "NSC form")])).toBe(
      "Filed & replied on #123 PDS layout misaligned; verified and closed #118 NSC form",
    );
    const many = [1, 2, 3, 4, 5].map((n) => act(1, null, n, "replied on", 9 + n));
    expect(describeActions(many)).toBe("Replied on #1 Ticket 1; replied on #2 Ticket 2; replied on #3 Ticket 3; +2 more");
    expect(describeActions([act(1, null, 9, "filed", 9, "A very long title that goes on and on and on")])).toBe("Filed #9 A very long title that goes on…");
    expect(describeActions([])).toBe("");
  });

  const fns = {
    core: [
      { duty: "Design", mfo: "Procurement UI", autofill: true, areaIds: ["proc"] },
      { duty: "", mfo: "Purchase Requisition UI", autofill: true, continues: true, areaIds: ["pr"] },
      { duty: "QA", mfo: "Everything else", autofill: true },
    ],
    support: [{ duty: "Meetings", mfo: "", autofill: false }],
  };

  it("puts work in the row linked to its nearest module, the rest in the catch-all row, and never in typed rows", () => {
    const cells = autoCells(fns, [act(1, "ap", 1, "filed"), act(1, "proc", 2, "replied on"), act(1, "hr", 3, "started"), act(1, null, 4, "filed")], days, chainOf, work);
    // Approval sits in Purchase Requisition, which has its own row, ahead of Procurement's.
    expect(cells.core[1][0]).toBe("Filed #1 Ticket 1");
    expect(cells.core[0][0]).toBe("Replied on #2 Ticket 2");
    expect(cells.core[2][0]).toBe("Started #3 Ticket 3; filed #4 Ticket 4");
    expect(cells.support[0][0]).toBe("");
    expect(cells.core[0][1]).toBe(""); // nothing on Oct 2
  });

  it("marks work outside work hours, and counts a late-evening action on its Manila day", () => {
    // Oct 3 is a Saturday: anything that day is after hours.
    const cells = autoCells(fns, [act(2, "hr", 5, "fixed", 10), act(2, "hr", 6, "replied on", 19), act(3, "hr", 7, "replied on", 20)], days, chainOf, work);
    expect(cells.core[2][1]).toBe("Fixed #5 Ticket 5 · After hours: Replied on #6 Ticket 6");
    expect(cells.core[2][2]).toBe("After hours: Replied on #7 Ticket 7");
    // 00:30 Manila on Oct 4 is 16:30 UTC on Oct 3.
    const late = autoCells(fns, [{ at: new Date("2026-10-03T16:30:00Z"), areaId: null, number: 8, title: "Late", verb: "filed" }], days, chainOf, work);
    expect(late.core[2][2]).toBe("");
    expect(late.core[2][3]).toBe("After hours: Filed #8 Late");
  });

  it("merges ticket work into a cell without replacing what was typed, and updates its own entry", () => {
    expect(mergeCell(NO_ENTRY, "", "Filed #1 A")).toBe("Filed #1 A");
    expect(mergeCell(REST_DAY, "", "After hours: Replied on #2 B")).toBe("REST DAY · After hours: Replied on #2 B");
    expect(mergeCell("Meeting with PMS team", "", "Filed #1 A")).toBe("Meeting with PMS team; Filed #1 A");
    // The earlier entry is swapped for the new one, wherever it sits, so nothing is added twice.
    expect(mergeCell("Meeting; Filed #1 A", "Filed #1 A", "Filed #1 A; replied on #2 B")).toBe("Meeting; Filed #1 A; replied on #2 B");
    expect(mergeCell("Meeting; Filed #1 A", "Filed #1 A", "Filed #1 A")).toBe("Meeting; Filed #1 A");
    // Nothing new: the cell stays as it is.
    expect(mergeCell("Typed", "Filed #1 A", "")).toBe("Typed");
    const merged = mergeCells({ core: [["-", "x"]], support: [] }, { core: [["", ""]], support: [] }, { core: [["Filed #1 A", ""]], support: [] });
    expect(merged).toEqual({ core: [["Filed #1 A", "x"]], support: [] });
  });

  it("knows weekends and Philippine holidays, Holy Week included", () => {
    expect(easter(2026)).toBe("2026-04-05");
    expect(easter(2027)).toBe("2027-03-28");
    expect(holidayOn("2026-04-02")).toBe("Maundy Thursday");
    expect(holidayOn("2026-04-03")).toBe("Good Friday");
    expect(holidayOn("2026-08-31")).toBe("National Heroes Day"); // the last Monday of August 2026
    expect(holidayOn("2026-03-16")).toBe("Araw ng Dabaw");
    expect(holidayOn("2026-12-25")).toBe("Christmas Day");
    expect(holidayOn("2026-10-06")).toBeNull();
    expect(isDayOff("2026-10-03")).toBe(true); // Saturday
    expect(isDayOff("2026-11-30")).toBe(true); // Monday, Bonifacio Day
    expect(isDayOff("2026-10-06")).toBe(false);
    expect(defaultEntry({ date: "2026-11-01" })).toBe(REST_DAY);
    expect(defaultEntry({ date: "2026-11-03" })).toBe(NO_ENTRY);
  });

  it("starts cells from each day's status: REST DAY on days off, \"-\" otherwise; an import's blanks too", () => {
    const d = periodDays({ start: "2026-10-01", end: "2026-10-04" });
    const status = defaultDays(d, work.workDays, "2026-10-02");
    expect(Object.values(status).map((x) => x.status)).toEqual(["PRESENT", "PRESENT", "REST", "REST"]);
    const defaults = statusDefaults(status, d);
    expect(defaults).toEqual([NO_ENTRY, NO_ENTRY, REST_DAY, REST_DAY]);
    expect(buildCells(fns, defaults).support[0]).toEqual(defaults);
    expect(fillDefaults({ core: [["", " ", "Tested BCA", ""]], support: [] }, defaults)).toEqual({ core: [[NO_ENTRY, NO_ENTRY, "Tested BCA", REST_DAY]], support: [] });
  });

  it("fits saved cells to the current rows and days", () => {
    const fresh = buildCells({ core: [fns.core[0]], support: [fns.support[0]] }, ["A", "B"]);
    expect(fitCells({ core: [["x", 5, "extra"]], support: "junk" }, fresh)).toEqual({ core: [["x", ""]], support: fresh.support });
    expect(fitCells(null, fresh)).toEqual(fresh);
  });
});

describe("DAR attendance", () => {
  const work = 62; // Mon–Fri
  const nov = periodDays({ start: "2026-11-03", end: "2026-11-17" });
  // The rows as copied from the ERP's log inquiry (the user's example, one record per block).
  const block = (date: string, dow: string, time: string, flag: string, where: string) =>
    ["Intong", "Intong, Kevin Kurt Matulac", "002696", date, dow, `${time}\t${dow}\t${flag}\t`, "BIO", where].join("\n");
  const pasted = [
    "Employee\nDate\nTime\nDay\nFlag\nSource",
    block("11/03/2026", "Tuesday", "08:06:04 AM", "In", "AMS024 - 4th Floor"),
    block("11/03/2026", "Tuesday", "08:06:05 AM", "In", "AMS024 - 4th Floor"),
    block("11/03/2026", "Tuesday", "05:07:14 PM", "Out", "AMS024 - 4th Floor"),
    block("11/03/2026", "Tuesday", "05:07:17 PM", "Out", "AMS024 - 4th Floor"),
    block("11/04/2026", "Wednesday", "08:33:37 AM", "In", "AMS017 - Matina 5"),
    block("11/06/2026", "Friday", "07:55:00 AM", "In", "AMS024 - 4th Floor"),
  ].join("\n");

  it("reads the pasted log: first time-in, last time-out and where, repeated taps once", () => {
    const logs = parseAttendance(pasted);
    expect(logs).toEqual([
      { date: "2026-11-03", in: "08:06 AM", out: "05:07 PM", where: "AMS024 - 4th Floor", taps: 4 },
      { date: "2026-11-04", in: "08:33 AM", out: null, where: "AMS017 - Matina 5", taps: 1 },
      { date: "2026-11-06", in: "07:55 AM", out: null, where: "AMS024 - 4th Floor", taps: 1 },
    ]);
    expect(parseAttendance("nothing useful here")).toEqual([]);
  });

  it("marks logged days Present and flags work days with no time-in, up to the last logged day", () => {
    const start = defaultDays(nov, work, "2026-11-30");
    const plan = applyAttendance(start, parseAttendance(pasted), work);
    expect(plan.present).toEqual(["2026-11-03", "2026-11-04", "2026-11-06"]);
    // Thursday Nov 5 had no log; days after Nov 6 aren't covered by the paste and stay as they were.
    expect(plan.noLog).toEqual(["2026-11-05"]);
    expect(plan.days["2026-11-05"].status).toBe("ABSENT");
    expect(plan.days["2026-11-03"]).toEqual({ status: "PRESENT", in: "08:06 AM", out: "05:07 PM", where: "AMS024 - 4th Floor" });
    expect(plan.days["2026-11-09"].status).toBe("PRESENT");
    expect(plan.days["2026-11-07"].status).toBe("REST"); // Saturday, no log: still a rest day
    expect(attendedCount(plan.days)).toBe(Object.values(plan.days).filter((d) => d.status === "PRESENT").length);
    expect(plan.outside).toBe(0);
  });

  it("keeps Leave and Remote that were already set, and counts only Present", () => {
    const start = defaultDays(nov, work, "2026-11-30");
    start["2026-11-05"] = { status: "LEAVE" };
    const plan = applyAttendance(start, parseAttendance(pasted), work);
    expect(plan.days["2026-11-05"].status).toBe("LEAVE");
    expect(attendedCount({ a: { status: "PRESENT" }, b: { status: "REMOTE" }, c: { status: "LEAVE" }, d: { status: "PRESENT" } })).toBe(2);
  });

  it("starts with holidays, days off and days still to come, and fits saved days", () => {
    const d = defaultDays(periodDays({ start: "2026-11-18", end: "2026-12-02" }), work, "2026-11-20");
    expect(d["2026-11-20"].status).toBe("PRESENT");
    expect(d["2026-11-21"].status).toBe("REST");
    expect(d["2026-11-23"].status).toBe("UPCOMING");
    expect(d["2026-11-30"].status).toBe("HOLIDAY"); // Bonifacio Day
    const fit = fitDays({ "2026-11-20": { status: "LEAVE" }, "2026-11-19": { status: "NOPE" }, "1999-01-01": { status: "PRESENT" } }, d);
    expect(fit["2026-11-20"]).toEqual({ status: "LEAVE" });
    expect(fit["2026-11-19"]).toEqual(d["2026-11-19"]);
    expect("1999-01-01" in fit).toBe(false);
  });
});

const profile = (p: Partial<NonNullable<DarProfileRow>> = {}): NonNullable<DarProfileRow> => ({
  fullName: null,
  position: null,
  department: null,
  unit: null,
  confirmedByName: null,
  confirmedByTitle: null,
  notedByName: null,
  notedByTitle: null,
  coreFunctions: null,
  supportFunctions: null,
  ...p,
});

describe("DAR details", () => {
  it("starts everyone empty, apart from the account name", () => {
    const h = resolveHeader(null, { name: "Rj" });
    expect(h).toEqual({
      name: "Rj",
      position: "",
      department: "",
      unit: "",
      supervisor: "",
      confirmedBy: { name: "", title: "" },
      notedBy: { name: "", title: "" },
      core: [],
      support: [],
    });
    expect(isEmptySetup(h)).toBe(true);
  });

  it("shows the person's own details, and ignores a bad stored list", () => {
    const mine = [{ duty: "My duty", mfo: "Mine", autofill: true }];
    const h = resolveHeader(
      profile({ fullName: "Reuben John F. Lisondra", position: " Developer ", unit: "Systems Unit", confirmedByName: "Boss", confirmedByTitle: "OIC", coreFunctions: mine, supportFunctions: "bad" }),
      { name: "Rj" },
    );
    expect(h).toMatchObject({ name: "Reuben John F. Lisondra", position: "Developer", unit: "Systems Unit", supervisor: "Boss", confirmedBy: { name: "Boss", title: "OIC" }, core: mine, support: [] });
    expect(isEmptySetup(h)).toBe(false);
  });

  it("gives an old backup's DAR users the old template, keeping what they had set", () => {
    const own = [{ duty: "Own", mfo: "", autofill: false }];
    const row = adoptLegacyTemplate({ userId: "u1", ...profile({ fullName: "Ana", position: "Tester", coreFunctions: own }) }, { unit: "QA Unit" });
    expect(row).toMatchObject({ userId: "u1", fullName: "Ana", position: "Tester", unit: "QA Unit", department: LEGACY_TEMPLATE.department, confirmedByName: LEGACY_TEMPLATE.confirmedBy.name });
    expect(row.coreFunctions).toEqual(own);
    expect(row.supportFunctions).toEqual(LEGACY_TEMPLATE.supportFunctions);
    // No stored template, or a broken one: the built-in values.
    expect(adoptLegacyTemplate({ userId: "u2" }, undefined)).toMatchObject({ position: LEGACY_TEMPLATE.position, coreFunctions: LEGACY_TEMPLATE.coreFunctions });
    expect(adoptLegacyTemplate({ userId: "u3" }, { unit: 5 })).toMatchObject({ unit: LEGACY_TEMPLATE.unit });
  });

  it("makes file-name initials", () => {
    expect(nameInitials("Reuben John F. Lisondra")).toBe("RJFL");
    expect(nameInitials("  ana  dela cruz ")).toBe("ADC");
  });
});

describe("darHtml", () => {
  it("merges a duty's number and cell down its MFO rows", () => {
    const period = { start: "2026-10-18", end: "2026-11-02" };
    const days = periodDays(period);
    const coreFunctions = [
      { duty: "Design ERP screens", mfo: "Billing UI", autofill: false },
      { duty: "", mfo: "HRM UI", autofill: false, continues: true },
      { duty: "QA testing", mfo: "Reports", autofill: false },
    ];
    const header = resolveHeader(profile({ coreFunctions }), { name: "x" });
    const r: DarReportData = { period, days, header, cells: buildCells(header, days.map(() => "")), dateSubmitted: "2026-11-04", daysAttended: 0, saved: false, status: {}, auto: { core: [], support: [] }, workDays: 62 };
    const html = darHtml(r);
    expect(html).toContain('<td class="n" rowspan="2">1</td><td class="duty" rowspan="2">Design ERP screens</td><td class="mfo">Billing UI</td>');
    expect(html).toContain('<tr><td class="mfo">HRM UI</td>');
    expect(html).toContain('<td class="n">2</td><td class="duty">QA testing</td>');
    expect(html).toContain("Oct 18, 2026 to Nov 02, 2026");
  });

  it("escapes everything typed", () => {
    const period = { start: "2026-10-01", end: "2026-10-15" };
    const days = periodDays(period);
    const header = resolveHeader(profile({ fullName: "<b>Ana</b>", coreFunctions: LEGACY_TEMPLATE.coreFunctions }), { name: "x" });
    const cells = buildCells(header, days.map(() => REST_DAY));
    cells.core[0][0] = `<script>alert(1)</script>`;
    const r: DarReportData = { period, days, header, cells, dateSubmitted: "2026-10-16", daysAttended: 1, saved: false, status: {}, auto: { core: [], support: [] }, workDays: 62 };
    const html = darHtml(r, { seal: `"><script>` });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("&lt;b&gt;Ana&lt;/b&gt;");
    expect(html).toContain("Oct 01, 2026 to Oct 15, 2026");
    expect(html).toContain("October 16, 2026");
    expect(html).toContain("1 Days");
    // Long bond paper and the DCWD workbook's colours.
    expect(html).toContain("size: 13in 8.5in");
    expect(html).toContain("print-color-adjust: exact"); // keep the fills when printing
    // No room for the browser's own headers and footers; the margin is even padding instead.
    expect(html).toContain("margin: 0; }");
    expect(html).toContain("padding: 0.5in");
    expect(html).toContain("background: #ffcc99");
    expect(html).toContain('<th class="core" colspan="2">A.) CORE FUNCTIONS</th>');
    expect(html).toContain("background: #fbd4b4");
    expect(html).toContain("color: #808000");
  });
});
