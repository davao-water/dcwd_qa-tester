import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { userAdminStore, type AccountChange } from "@/lib/users/store";
import { createTestDb } from "./helpers/test-db";

// Admin → Users' saving and loading: requests, the account list and editing an account.

let db: PrismaClient;
let cleanup: () => Promise<void>;
let store: ReturnType<typeof userAdminStore>;

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
  store = userAdminStore(db);
});

afterAll(async () => {
  await cleanup();
});

beforeEach(async () => {
  await db.areaMember.deleteMany();
  await db.erpArea.deleteMany();
  await db.user.deleteMany();
});

type Extra = { pending?: boolean; active?: boolean; resetRequestedAt?: Date; createdAt?: Date };
const person = (name: string, role: "QA" | "DEV" | "ADMIN", extra: Extra = {}) =>
  db.user.create({ data: { name, email: `${name.toLowerCase().replace(/\W/g, "")}@davao-water.gov.ph`, passwordHash: "x", role, ...extra } });

const change = (over: Partial<AccountChange> = {}): AccountChange => ({
  name: "Ben",
  email: "ben@davao-water.gov.ph",
  role: "DEV",
  designer: false,
  teamLead: false,
  active: true,
  ...over,
});

describe("userAdminStore requests", () => {
  it("lists sign-ups and reset requests, oldest first, each only in its own list", async () => {
    await person("Late", "QA", { pending: true, createdAt: new Date("2026-11-02") });
    await person("Early", "DEV", { pending: true, createdAt: new Date("2026-11-01") });
    await person("Forgot", "QA", { resetRequestedAt: new Date("2026-11-03") });
    await person("Fine", "QA");

    expect((await store.signUpRequests()).map((u) => u.name)).toEqual(["Early", "Late"]);
    expect((await store.resetRequests()).map((u) => u.name)).toEqual(["Forgot"]);
  });
});

describe("userAdminStore.accounts", () => {
  it("lists approved accounts, active first, with their modules; none for temporary access", async () => {
    const billing = await db.erpArea.create({ data: { name: "Billing" } });
    const ben = await person("Ben", "DEV");
    await person("Off", "DEV", { active: false });
    await person("Waiting", "QA", { pending: true });
    await db.areaMember.create({ data: { areaId: billing.id, userId: ben.id, isLead: true } });

    const list = await store.accounts(true);
    expect(list.map((u) => u.name)).toEqual(["Ben", "Off"]);
    expect(list[0].areas).toEqual([{ isLead: true, area: { name: "Billing", parent: null } }]);
    expect(await store.accounts(false)).toEqual([]);
  });
});

describe("userAdminStore.contact", () => {
  it("gives an account's email, role and reset request, or null when it's gone", async () => {
    const at = new Date("2026-11-03");
    const ana = await person("Ana", "QA", { resetRequestedAt: at });
    expect(await store.contact(ana.id)).toEqual({ email: "ana@davao-water.gov.ph", role: "QA", resetRequestedAt: at });
    expect(await store.contact("gone")).toBeNull();
  });
});

describe("userAdminStore.update", () => {
  it("saves an account's changes", async () => {
    const ben = await person("Ben", "DEV");
    expect(await store.update(ben.id, change({ name: "Benjie", designer: true, teamLead: true }))).toBeNull();
    const after = await db.user.findUniqueOrThrow({ where: { id: ben.id } });
    expect([after.name, after.designer, after.teamLead]).toEqual(["Benjie", true, true]);
  });

  it("won't turn on a pending sign-up, but saves it while it stays off", async () => {
    const ben = await person("Ben", "DEV", { pending: true, active: false });
    expect(await store.update(ben.id, change())).toBe("Use Approve in the list above. It creates their temporary password.");
    expect(await store.update(ben.id, change({ name: "Benjie", active: false }))).toBeNull();
    expect((await db.user.findUniqueOrThrow({ where: { id: ben.id } })).name).toBe("Benjie");
  });

  it("throws on an email another account already uses, for the screen to explain", async () => {
    const ben = await person("Ben", "DEV");
    await person("Ana", "QA");
    await expect(store.update(ben.id, change({ email: "ana@davao-water.gov.ph" }))).rejects.toMatchObject({ code: "P2002" });
  });
});
