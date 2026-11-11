import { describe, expect, it } from "vitest";
import { applyAttendance, attendedCount, defaultDays, fitDays, parseAttendance } from "@/lib/dar/attendance";
import { periodDays } from "@/lib/dar/period";

// DAR attendance: reading the pasted time log and marking each day.

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
