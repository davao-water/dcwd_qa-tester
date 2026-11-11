import { describe, expect, it } from "vitest";
import { longDate, manilaDay, parsePeriod, periodDays, periodFileLabel, periodFor, periodLabel, periodRange, previousPeriod, recentPeriods } from "@/lib/dar/period";

// DAR periods: the 1st-15th and 16th-end halves of each month, in Manila time.

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
