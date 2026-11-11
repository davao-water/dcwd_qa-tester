import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { reporterOptions, ticketFormOptions } from "@/lib/tickets/form-options";
import { createTestDb } from "./helpers/test-db";

// The lists the ticket screens offer: QA testers to filter by, modules to pick and developers to assign.

let db: PrismaClient;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
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

const person = (name: string, role: "QA" | "DEV" | "ADMIN", active = true) =>
  db.user.create({ data: { name, email: `${name.toLowerCase().replace(/\W/g, "")}@x.ph`, passwordHash: "x", role, active } });

describe("reporterOptions", () => {
  it("lists QA testers and admins, active people first, and keeps people who left", async () => {
    await person("Zed QA", "QA");
    await person("Ann QA", "QA", false);
    await person("Ada Admin", "ADMIN");
    await person("Ben Dev", "DEV");

    const got = await reporterOptions(db);
    expect(got.map((p) => [p.name, p.active])).toEqual([
      ["Ada Admin", true],
      ["Zed QA", true],
      ["Ann QA", false],
    ]);
  });
});

describe("ticketFormOptions", () => {
  it("gives the active modules as a tree, without hidden ones", async () => {
    const billing = await db.erpArea.create({ data: { name: "Billing" } });
    await db.erpArea.create({ data: { name: "Meter Reading", parentId: billing.id } });
    await db.erpArea.create({ data: { name: "Old module", active: false } });

    const { areas } = await ticketFormOptions(db);
    expect(areas).toEqual([{ id: billing.id, name: "Billing", children: [{ id: expect.any(String), name: "Meter Reading", children: [] }] }]);
  });

  it("offers only active developers, by name, with the areas they work on and lead", async () => {
    const billing = await db.erpArea.create({ data: { name: "Billing" } });
    const reading = await db.erpArea.create({ data: { name: "Reading" } });
    const cy = await person("Cy Dev", "DEV");
    const ben = await person("Ben Dev", "DEV");
    await person("Gone Dev", "DEV", false);
    await person("Ada Admin", "ADMIN");
    await person("Ana QA", "QA");
    await db.areaMember.create({ data: { areaId: billing.id, userId: ben.id, isLead: true } });
    await db.areaMember.create({ data: { areaId: reading.id, userId: ben.id, isLead: false } });

    const { people } = await ticketFormOptions(db);
    expect(people).toEqual([
      { id: ben.id, name: "Ben Dev", role: "DEV", areaIds: expect.arrayContaining([billing.id, reading.id]), leadAreaIds: [billing.id] },
      { id: cy.id, name: "Cy Dev", role: "DEV", areaIds: [], leadAreaIds: [] },
    ]);
  });
});
