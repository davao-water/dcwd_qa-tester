import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { can } from "@/lib/auth/permissions";
import { authStore } from "@/lib/auth/store";
import { liveGrant, TempAccessError, tempAccessStore } from "@/lib/auth/temp-access";
import { dailyCleanup } from "@/lib/cron";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { createTestDb } from "./helpers/test-db";

let db: PrismaClient;
let cleanup: () => Promise<void>;
let t = new Date("2026-11-09T01:00:00Z").getTime();
const now = () => new Date(t);
const HOUR = 60 * 60 * 1000;

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
});

afterAll(async () => {
  await cleanup();
});

let admin: string, qa: string, otherAdmin: string, off: string;

beforeEach(async () => {
  t = new Date("2026-11-09T01:00:00Z").getTime();
  await db.tempAccess.deleteMany();
  await db.session.deleteMany();
  await db.user.deleteMany();
  const store = authStore(db, now);
  const make = async (name: string, role: "ADMIN" | "QA") => (await store.createUser({ name, email: `${name}@davao-water.gov.ph`, role, password: "temp-pass-123", mustChangePassword: false })).id;
  [admin, qa, otherAdmin, off] = await Promise.all([make("boss", "ADMIN"), make("ana", "QA"), make("chief", "ADMIN"), make("gone", "QA")]);
  await db.user.update({ where: { id: off }, data: { active: false } });
});

describe("liveGrant", () => {
  it("lends nothing once it has run out, and drops names that aren't grantable", () => {
    const at = new Date("2026-11-09T05:00:00Z");
    expect(liveGrant({ actions: ["users.requests"], expiresAt: at }, new Date(at.getTime() - 1))).toEqual({ actions: ["users.requests"], expiresAt: at });
    expect(liveGrant({ actions: ["users.requests"], expiresAt: at }, at)).toBeNull();
    expect(liveGrant({ actions: ["users.manage", "areas.manage", "areas.manage"], expiresAt: at }, new Date(0))).toEqual({ actions: ["areas.manage"], expiresAt: at });
    expect(liveGrant({ actions: ["users.manage"], expiresAt: at }, new Date(0))).toBeNull();
    expect(liveGrant(null, new Date(0))).toBeNull();
  });
});

describe("tempAccessStore", () => {
  it("gives features for some hours, shows them in the session, and they end by themselves", async () => {
    const grants = tempAccessStore(db, now);
    const store = authStore(db, now);
    const { token } = await store.createSession(qa);

    expect((await store.resolveSession(token))?.grants).toEqual([]);
    const g = await grants.give(admin, { userId: qa, actions: ["users.requests", "tickets.viewAll"], hours: 3 });
    expect(g.expiresAt).toEqual(new Date(t + 3 * HOUR));

    const me = (await store.resolveSession(token))!;
    expect(me.role).toBe("QA");
    expect(me.grants).toEqual(["users.requests", "tickets.viewAll"]);
    expect(me.grantsUntil).toEqual(g.expiresAt);
    expect(can(me, "users.requests")).toBe(true);
    expect(can(me, "tickets.viewAll")).toBe(true);
    expect(can(me, "users.manage")).toBe(false);
    expect(can(me, "areas.manage")).toBe(false);
    expect([...(await grants.live()).keys()]).toEqual([qa]);

    // Three hours later it's gone, with nothing run in between.
    t += 3 * HOUR;
    const later = (await store.resolveSession(token))!;
    expect(later.grants).toEqual([]);
    expect(later.grantsUntil).toBeNull();
    expect(can(later, "users.requests")).toBe(false);
    expect((await grants.live()).size).toBe(0);

    // The daily clean-up then deletes the row.
    expect((await dailyCleanup(db, now())).removed.tempAccess).toBe(1);
    expect(await db.tempAccess.count()).toBe(0);
  });

  it("replaces earlier access when given again, and ends early on request", async () => {
    const grants = tempAccessStore(db, now);
    await grants.give(admin, { userId: qa, actions: ["users.requests"], hours: 8 });
    await grants.give(otherAdmin, { userId: qa, actions: ["areas.manage"], hours: 1 });
    const row = await db.tempAccess.findUniqueOrThrow({ where: { userId: qa } });
    expect(row).toMatchObject({ actions: ["areas.manage"], grantedById: otherAdmin, expiresAt: new Date(t + HOUR) });

    expect(await grants.end(qa)).toBe(true);
    expect(await grants.end(qa)).toBe(false);
    expect(await db.tempAccess.count()).toBe(0);
  });

  it("refuses bad hours, unknown features, admins, yourself and turned-off accounts", async () => {
    const grants = tempAccessStore(db, now);
    const give = (input: { userId: string; actions: string[]; hours: number }, by = admin) => grants.give(by, input);
    const ok = { userId: qa, actions: ["users.requests"], hours: 4 };
    for (const hours of [0, 73, 1.5, Number.NaN]) await expect(give({ ...ok, hours })).rejects.toThrow(/1 to 72 hours/);
    await expect(give({ ...ok, actions: [] })).rejects.toThrow(/at least one/);
    await expect(give({ ...ok, actions: ["users.manage"] })).rejects.toThrow(TempAccessError);
    await expect(give({ ...ok, userId: otherAdmin })).rejects.toThrow(/already have every feature/);
    await expect(give({ ...ok, userId: admin })).rejects.toThrow(/yourself/);
    await expect(give({ ...ok, userId: off })).rejects.toThrow(/Turn the account on/);
    await expect(give({ ...ok, userId: "nope" })).rejects.toThrow(/no longer exists/);
    expect(await db.tempAccess.count()).toBe(0);
    await expect(give({ ...ok, hours: 72 })).resolves.toMatchObject({ actions: ["users.requests"] });
  });

  it("goes when the account is deleted, and outlives the admin who gave it", async () => {
    const grants = tempAccessStore(db, now);
    await grants.give(admin, { userId: qa, actions: ["tickets.viewAll"], hours: 2 });
    await db.user.delete({ where: { id: admin } });
    expect((await db.tempAccess.findUniqueOrThrow({ where: { userId: qa } })).grantedById).toBeNull();
    await db.user.delete({ where: { id: qa } });
    expect(await db.tempAccess.count()).toBe(0);
  });
});
