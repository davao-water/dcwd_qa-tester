import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { addToAreas } from "@/lib/areas/assign";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { areaAssignInput } from "@/lib/schemas/area";
import { createTestDb } from "./helpers/test-db";

let db: PrismaClient;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
});

afterAll(async () => {
  await cleanup();
});

let ids: Record<string, string>;

beforeEach(async () => {
  await db.areaMember.deleteMany();
  await db.user.deleteMany();
  await db.erpArea.deleteMany({ where: { parentId: { not: null } } });
  await db.erpArea.deleteMany();
  const user = (name: string, role: "QA" | "DEV", extra: { designer?: boolean; active?: boolean } = {}) =>
    db.user.create({ data: { name, email: `${name.toLowerCase()}@davao-water.gov.ph`, passwordHash: "x", role, ...extra } });
  const [qa, dev, old, designer, gone] = await Promise.all([
    user("Ana", "QA"),
    user("Ben", "DEV"),
    user("Old", "DEV"),
    user("Dee", "DEV", { designer: true }),
    user("Gone", "DEV", { active: false }),
  ]);
  const bca = await db.erpArea.create({ data: { name: "Billing", sortOrder: 0 } });
  const [mr, fin] = await Promise.all([
    db.erpArea.create({ data: { name: "Meter Reading", parentId: bca.id, sortOrder: 0 } }),
    db.erpArea.create({ data: { name: "Finance", sortOrder: 1 } }),
  ]);
  ids = { qa: qa.id, dev: dev.id, old: old.id, designer: designer.id, gone: gone.id, bca: bca.id, mr: mr.id, fin: fin.id };
  // Billing already has Old as its lead and Dee as a plain developer.
  await db.areaMember.createMany({
    data: [
      { areaId: bca.id, userId: old.id, isLead: true },
      { areaId: bca.id, userId: designer.id },
    ],
  });
});

const membersOf = async (areaId: string) =>
  (await db.areaMember.findMany({ where: { areaId }, select: { userId: true, isLead: true, asDesigner: true } }))
    .map((m) => `${Object.entries(ids).find(([, v]) => v === m.userId)?.[0]}${m.isLead ? "*" : ""}${m.asDesigner ? "+ui" : ""}`)
    .sort();

describe("addToAreas", () => {
  it("adds people to every area and keeps who is already there", async () => {
    expect(await addToAreas(db, { areaIds: [ids.bca, ids.mr, ids.fin], members: [ids.qa, ids.dev], lead: null, designers: [] })).toBeNull();
    expect(await membersOf(ids.bca)).toEqual(["designer", "dev", "old*", "qa"]);
    expect(await membersOf(ids.mr)).toEqual(["dev", "qa"]);
    expect(await membersOf(ids.fin)).toEqual(["dev", "qa"]);
    // Running it again changes nothing.
    expect(await addToAreas(db, { areaIds: [ids.bca, ids.mr], members: [ids.qa, ids.dev], lead: null, designers: [] })).toBeNull();
    expect(await db.areaMember.count()).toBe(8);
  });

  it("makes the chosen lead replace the current one, and marks UI/UX on rows that already exist", async () => {
    expect(await addToAreas(db, { areaIds: [ids.bca, ids.mr], members: [ids.dev, ids.designer], lead: ids.dev, designers: [ids.designer] })).toBeNull();
    expect(await membersOf(ids.bca)).toEqual(["designer+ui", "dev*", "old"]);
    expect(await membersOf(ids.mr)).toEqual(["designer+ui", "dev*"]);
  });

  it("refuses a QA lead, a non-designer as UI/UX, inactive people and missing areas", async () => {
    const base = { areaIds: [ids.fin], members: [ids.qa, ids.dev], lead: null, designers: [] as string[] };
    expect(await addToAreas(db, { ...base, lead: ids.qa })).toMatch(/lead must be a developer/);
    expect(await addToAreas(db, { ...base, lead: ids.old })).toMatch(/lead must also be ticked/);
    expect(await addToAreas(db, { ...base, designers: [ids.dev] })).toMatch(/Designer tick-box/);
    expect(await addToAreas(db, { ...base, members: [ids.gone] })).toMatch(/no longer exists/);
    expect(await addToAreas(db, { ...base, areaIds: ["nope"] })).toMatch(/module in the list/);
    expect(await addToAreas(db, { ...base, areaIds: [] })).toMatch(/at least one module/);
    expect(await membersOf(ids.fin)).toEqual([]);
  });
});

describe("areaAssignInput", () => {
  it("needs at least one module and one person, and turns an empty lead into null", () => {
    expect(areaAssignInput.safeParse({ areaIds: [], members: ["a"], lead: "" }).success).toBe(false);
    expect(areaAssignInput.safeParse({ areaIds: ["x"], members: [], lead: "" }).success).toBe(false);
    expect(areaAssignInput.parse({ areaIds: ["x"], members: ["a"], lead: "" })).toEqual({ areaIds: ["x"], members: ["a"], lead: null, designers: [] });
  });
});
