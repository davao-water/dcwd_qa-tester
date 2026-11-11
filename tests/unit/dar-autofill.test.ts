import { describe, expect, it } from "vitest";
import { defaultDays } from "@/lib/dar/attendance";
import { areaLabel, autoCells, buildCells, defaultEntry, describe as describeActions, fillDefaults, fitCells, mergeCell, mergeCells, NO_ENTRY, REST_DAY, statusDefaults, verbFor } from "@/lib/dar/autofill";
import { easter, holidayOn, isDayOff } from "@/lib/dar/holidays";
import { periodDays } from "@/lib/dar/period";

// DAR auto-fill: turning ticket work into the report's cells.

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
