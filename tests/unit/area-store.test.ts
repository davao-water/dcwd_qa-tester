import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { areaStore } from "@/lib/areas/store";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { areaInput } from "@/lib/schemas/area";
import { createTestDb } from "./helpers/test-db";

// Team & modules' saving and loading: modules, sub-modules and who works on each.

let db: PrismaClient;
let cleanup: () => Promise<void>;
let store: ReturnType<typeof areaStore>;

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
  store = areaStore(db);
});

afterAll(async () => {
  await cleanup();
});

beforeEach(async () => {
  await db.areaMember.deleteMany();
  await db.erpArea.deleteMany({ where: { parentId: { not: null } } });
  await db.erpArea.deleteMany();
  await db.user.deleteMany();
});

/** A form's fields, as the Add / Edit module dialog sends them. */
const area = (over: Record<string, unknown> = {}) => areaInput.parse({ name: "Billing", code: "", parentId: "", active: true, ...over });
const person = (name: string, role: "QA" | "DEV" | "ADMIN", extra: { designer?: boolean; active?: boolean } = {}) =>
  db.user.create({ data: { name, email: `${name.toLowerCase().replace(/\W/g, "")}@x.ph`, passwordHash: "x", role, ...extra } });

describe("areaStore.save", () => {
  it("adds a module, and puts a new sub-module after its siblings", async () => {
    expect(await store.save(undefined, area({ sortOrder: "4" }))).toBeNull();
    const billing = await db.erpArea.findFirstOrThrow({ where: { name: "Billing" } });
    expect(billing.sortOrder).toBe(4);

    await store.save(undefined, area({ name: "Ledger", parentId: billing.id }));
    await store.save(undefined, area({ name: "Payments", parentId: billing.id }));
    const subs = await db.erpArea.findMany({ where: { parentId: billing.id }, orderBy: { sortOrder: "asc" } });
    expect(subs.map((s) => s.name)).toEqual(["Ledger", "Payments"]);
    expect(subs[1].sortOrder).toBeGreaterThan(subs[0].sortOrder);
  });

  it("edits an area in place, keeping a sub-module's order", async () => {
    const billing = await db.erpArea.create({ data: { name: "Billing" } });
    const sub = await db.erpArea.create({ data: { name: "Ledger", parentId: billing.id, sortOrder: 7 } });
    expect(await store.save(sub.id, area({ name: "General ledger", parentId: billing.id, code: "gl-1" }))).toBeNull();
    const after = await db.erpArea.findUniqueOrThrow({ where: { id: sub.id } });
    expect([after.name, after.code, after.sortOrder]).toEqual(["General ledger", "GL-1", 7]);
  });

  it("says why an area can't go somewhere, and saves nothing", async () => {
    await db.erpArea.create({ data: { name: "Billing" } });
    const problem = await store.save(undefined, area({ name: "Billing" }));
    expect(problem).toEqual(expect.any(String));
    expect(await db.erpArea.count()).toBe(1);
  });

  it("throws on a code another area already uses, for the screen to explain", async () => {
    await store.save(undefined, area({ name: "Billing", code: "BIL" }));
    await expect(store.save(undefined, area({ name: "Meter Reading", code: "BIL" }))).rejects.toMatchObject({ code: "P2002" });
  });
});

describe("areaStore.remove", () => {
  it("refuses an area with sub-modules, then deletes it once they are gone", async () => {
    const billing = await db.erpArea.create({ data: { name: "Billing" } });
    const sub = await db.erpArea.create({ data: { name: "Ledger", parentId: billing.id } });
    expect(await store.remove(billing.id)).toBe("Delete or move its sub-modules first.");
    expect(await store.remove(sub.id)).toBeNull();
    expect(await store.remove(billing.id)).toBeNull();
    expect(await db.erpArea.count()).toBe(0);
  });
});

describe("areaStore.setMembers", () => {
  it("replaces the member list, with the lead and UI/UX designers marked", async () => {
    const billing = await db.erpArea.create({ data: { name: "Billing" } });
    const [ben, cy, dee] = await Promise.all([person("Ben", "DEV"), person("Cy", "DEV", { designer: true }), person("Dee", "QA")]);
    await db.areaMember.create({ data: { areaId: billing.id, userId: dee.id } });

    expect(await store.setMembers({ areaId: billing.id, members: [ben.id, cy.id], lead: ben.id, designers: [cy.id] })).toBeNull();
    const rows = await db.areaMember.findMany({ where: { areaId: billing.id }, select: { userId: true, isLead: true, asDesigner: true } });
    expect(rows).toHaveLength(2);
    expect(rows).toEqual(
      expect.arrayContaining([
        { userId: ben.id, isLead: true, asDesigner: false },
        { userId: cy.id, isLead: false, asDesigner: true },
      ]),
    );
  });

  it("refuses a missing person, a QA lead and a designer without the tick-box", async () => {
    const billing = await db.erpArea.create({ data: { name: "Billing" } });
    const [ben, ana] = await Promise.all([person("Ben", "DEV"), person("Ana", "QA")]);
    const set = (members: string[], lead: string | null, designers: string[] = []) => store.setMembers({ areaId: billing.id, members, lead, designers });

    expect(await set([ben.id, "gone"], null)).toBe("Someone in the list no longer exists. Refresh the page.");
    expect(await set([ana.id], ana.id)).toBe("The lead must be a developer or an admin.");
    expect(await set([ben.id], null, [ben.id])).toBe("Only people with the Designer tick-box (Users) can work on a module as its UI/UX designer.");
    expect(await db.areaMember.count()).toBe(0);
  });
});

describe("areaStore loading", () => {
  it("lists areas with only their active members, and active people by name", async () => {
    const billing = await db.erpArea.create({ data: { name: "Billing" } });
    const [zed, ann, old] = await Promise.all([person("Zed", "DEV"), person("Ann", "QA"), person("Old", "DEV", { active: false })]);
    await db.areaMember.createMany({ data: [zed, old].map((u) => ({ areaId: billing.id, userId: u.id })) });

    const [areas] = await store.areasWithMembers();
    expect(areas.members.map((m) => m.user.name)).toEqual(["Zed"]);
    expect((await store.activePeople()).map((p) => p.name)).toEqual([ann.name, zed.name]);
  });
});
