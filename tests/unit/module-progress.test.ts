import { describe, expect, it } from "vitest";
import { counts, fairScore, memberModules, moduleProgress, percent, progressTone, type ProgressArea, type ProgressTicket } from "@/lib/tickets/progress";

const areas: ProgressArea[] = [
  { id: "bill", name: "Billing", parentId: null, active: true },
  { id: "meter", name: "Meter Reading", parentId: "bill", active: true },
  { id: "pay", name: "Payroll", parentId: null, active: true },
  { id: "acct", name: "Accounting", parentId: null, active: true },
  { id: "old", name: "Old module", parentId: null, active: false },
];

const tk = (over: Partial<ProgressTicket>): ProgressTicket => ({ areaId: "bill", category: "FRONT_END", status: "NEW", ...over });
const closed = (over: Partial<ProgressTicket> = {}) => tk({ status: "CLOSED", closedFrom: "VERIFIED", ...over });
const card = (tickets: ProgressTicket[], id = "bill") => moduleProgress(areas, tickets).find((c) => c.id === id)!;
const zero = { done: 0, total: 0, pct: 0 };

describe("module progress", () => {
  it("leaves out rejected, duplicate, won't fix and withdrawn tickets", () => {
    for (const status of ["REJECTED", "DUPLICATE", "WONT_FIX"] as const) expect(counts(tk({ status }))).toBe(false);
    expect(counts(tk({ status: "CLOSED", closedFrom: "NEW" }))).toBe(false);
    expect(counts(tk({ status: "CLOSED", closedFrom: "NEED_INFO" }))).toBe(false);
    expect(counts(closed())).toBe(true);
    // A Closed ticket with no recorded move counts as a normal close.
    expect(counts(tk({ status: "CLOSED", closedFrom: null }))).toBe(true);
  });

  it("counts only Closed as done, so Verified doesn't count yet", () => {
    const c = card([closed(), tk({ status: "VERIFIED" }), tk({ status: "REOPENED" })]);
    expect(c.categories.FRONT_END).toEqual({ done: 1, total: 3, pct: 33 });
  });

  it("rounds down, so 100% only means everything is closed, and 0 of 0 is 0%", () => {
    expect(percent(249, 250)).toBe(99);
    expect(percent(2, 3)).toBe(66);
    expect(percent(3, 3)).toBe(100);
    expect(percent(0, 0)).toBe(0);
  });

  it("scores a module fairly: full credit only once it has 5 tickets", () => {
    expect(fairScore(1, 1)).toBe(20);
    expect(fairScore(2, 4)).toBe(40);
    expect(fairScore(3, 3)).toBe(60);
    expect(fairScore(5, 5)).toBe(100);
    expect(fairScore(9, 10)).toBe(90);
    expect(fairScore(0, 0)).toBe(0);
  });

  it("builds the module score from all its tagged tickets, never the untagged ones", () => {
    const c = card([closed(), closed({ category: "BACK_END" }), tk({ category: "UI_UX" }), closed({ category: null }), tk({ category: null })]);
    expect(c.score).toEqual({ done: 2, total: 3, pct: 40 });
    expect(c.untagged).toBe(2);
  });

  it("rolls a third level up into its top-level module, and keeps people's modules through it", () => {
    const deep: ProgressArea[] = [...areas, { id: "upload", name: "Reading Upload", parentId: "meter", active: true }];
    const c = moduleProgress(deep, [tk({ areaId: "upload", category: "UI_UX" })]).find((x) => x.id === "bill")!;
    expect(c.categories.UI_UX).toEqual({ done: 0, total: 1, pct: 0 });
    expect(memberModules(deep, ["upload"])).toEqual(new Set(["bill"]));
  });

  it("rolls sub-modules up into their module, and shows untagged tickets apart", () => {
    const c = card([tk({ areaId: "meter", category: "BACK_END" }), tk({ category: null }), tk({ areaId: "meter", category: null })]);
    expect(c.categories.BACK_END).toEqual({ done: 0, total: 1, pct: 0 });
    expect(c.categories.FRONT_END).toEqual(zero);
    expect(c.untagged).toBe(2);
  });

  it("still counts tickets on an inactive sub-module for its module", () => {
    const withOldSub = [...areas, { id: "oldsub", name: "Old sub", parentId: "bill", active: false }];
    expect(moduleProgress(withOldSub, [tk({ areaId: "oldsub" })]).find((c) => c.id === "bill")!.categories.FRONT_END).toEqual({ done: 0, total: 1, pct: 0 });
  });

  it("shows a module with no tickets as 0%, and skips inactive modules and tickets with no module", () => {
    const cards = moduleProgress(areas, [tk({ areaId: null }), tk({ areaId: "old" })]);
    expect(cards.map((c) => c.id)).not.toContain("old");
    expect(cards.every((c) => c.score.pct === 0 && Object.values(c.categories).every((p) => p.total === 0))).toBe(true);
  });

  it("puts the lowest score first, ties by name, and modules with no counted tickets last", () => {
    // Billing 1 of 2 → 20, Payroll 4 of 5 → 80, Accounting 0 of 1 → 0.
    const cards = moduleProgress(areas, [
      closed(),
      tk({}),
      ...[1, 2, 3, 4].map(() => closed({ areaId: "pay" })),
      tk({ areaId: "pay" }),
      tk({ areaId: "acct", category: "UI_UX" }),
    ]);
    expect(cards.map((c) => [c.name, c.score.pct])).toEqual([["Accounting", 0], ["Billing", 20], ["Payroll", 80]]);
    const tie = moduleProgress(areas, [tk({ areaId: "pay" }), tk({ areaId: "bill" })]);
    expect(tie.map((c) => c.name)).toEqual(["Billing", "Payroll", "Accounting"]);
  });

  it("puts a module with only untagged tickets with the empty ones", () => {
    const cards = moduleProgress(areas, [tk({ areaId: "acct", category: null }), tk({ areaId: "pay" })]);
    expect(cards.map((c) => c.name)).toEqual(["Payroll", "Accounting", "Billing"]);
    expect(cards[1].untagged).toBe(1);
  });

  it("finds a person's modules through a sub-module", () => {
    expect([...memberModules(areas, ["meter"])]).toEqual(["bill"]);
    expect([...memberModules(areas, ["bill", "meter", "pay"])].sort()).toEqual(["bill", "pay"]);
    expect([...memberModules(areas, ["gone"])]).toEqual([]);
  });

  it("colours 0 grey, 1–29 red, 30–59 yellow, 60–89 blue, 90–100 green", () => {
    expect([0, 1, 29, 30, 59, 60, 89, 90, 100].map(progressTone)).toEqual(["none", "low", "low", "mid", "mid", "good", "good", "done", "done"]);
  });
});
