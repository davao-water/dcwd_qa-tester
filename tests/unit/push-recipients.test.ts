import { describe, expect, it } from "vitest";
import { delivery, inWorkHours, pickRecipients, type WorkHours } from "@/lib/push/recipients";
import type { Actor } from "@/lib/tickets/workflow";
import { manila } from "./helpers/manila";

// Who gets a notification, and when: work hours and each person's choice.

const always: WorkHours = { offHoursPush: "SOUND", workStartMin: 420, workEndMin: 1080, workDays: 62 };
const office: WorkHours = { ...always, offHoursPush: "NONE" };
const quiet: WorkHours = { ...always, offHoursPush: "SILENT" };

describe("inWorkHours and delivery", () => {
  it("rings at any hour for someone who chose sound", () => {
    expect(delivery(always, manila("2026-11-01T23:00:00"))).toBe("sound");
  });

  it("outside work hours stays off when asked, and an old Silent choice counts as off (D7)", () => {
    const night = manila("2026-11-02T22:00:00"); // Monday 22:00
    const sunday = manila("2026-11-01T10:00:00");
    expect(delivery(office, night)).toBeNull();
    expect(delivery(quiet, night)).toBeNull();
    expect(delivery(quiet, sunday)).toBeNull();
    expect(delivery(quiet, manila("2026-11-02T10:00:00"))).toBe("sound");
  });

  it("uses Manila time, weekdays and the end as exclusive", () => {
    expect(inWorkHours(office, manila("2026-11-02T07:00:00"))).toBe(true); // Monday 07:00
    expect(inWorkHours(office, manila("2026-11-02T06:59:00"))).toBe(false);
    expect(inWorkHours(office, manila("2026-11-02T18:00:00"))).toBe(false);
    expect(inWorkHours(office, manila("2026-11-01T10:00:00"))).toBe(false); // Sunday
  });

  it("handles a shift past midnight", () => {
    const night = { ...office, workStartMin: 22 * 60, workEndMin: 6 * 60, workDays: 127 };
    expect(inWorkHours(night, manila("2026-11-02T23:30:00"))).toBe(true);
    expect(inWorkHours(night, manila("2026-11-02T05:00:00"))).toBe(true);
    expect(inWorkHours(night, manila("2026-11-02T12:00:00"))).toBe(false);
  });
});

describe("pickRecipients", () => {
  const ticket = { status: "NEW" as const, reporterId: "qa", assigneeId: "dev" };
  const c = (id: string, role: Actor["role"], w: WorkHours = always) => ({ id, role, ...w });

  it("skips the actor and people who can't see the ticket", () => {
    const got = pickRecipients(ticket, "qa", [c("qa", "QA"), c("qa2", "QA"), c("dev", "DEV"), c("dev2", "DEV"), c("admin", "ADMIN")], manila("2026-11-02T10:00:00"));
    expect(got.map((r) => r.id)).toEqual(["dev", "admin"]);
  });

  it("skips people outside their work hours", () => {
    const got = pickRecipients(ticket, "qa", [c("dev", "DEV", office), c("admin", "ADMIN")], manila("2026-11-02T20:00:00"));
    expect(got.map((r) => r.id)).toEqual(["admin"]);
  });

  it("leaves out someone off work who chose no notifications, or still holds the old Silent choice", () => {
    const got = pickRecipients(ticket, "qa", [c("dev", "DEV", quiet), c("admin", "ADMIN")], manila("2026-11-02T20:00:00"));
    expect(got.map((r) => [r.id, r.delivery])).toEqual([["admin", "sound"]]);
  });
});
