import { afterAll, beforeAll, beforeEach } from "vitest";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { ticketFilters, type TicketCreate } from "@/lib/schemas/ticket";
import type { ticketStore } from "@/lib/tickets/store";
import type { Actor } from "@/lib/tickets/workflow";
import { createTestDb } from "./test-db";

// The shared setup of the ticket store tests: a fresh in-memory database, a fake clock, four people and two modules,
// reset before every test. Each test file calls setUpTicketStoreDb() once, then reads the values below.

export let db: PrismaClient;
let cleanup: () => Promise<void>;
let t = 0;
export const now = () => new Date(t);
export const tick = () => (t += 60_000);
/** Sets the fake clock to a moment, in milliseconds. */
export const setClock = (ms: number) => (t = ms);

export let qa: Actor, dev: Actor, dev2: Actor, admin: Actor;
export let billing: string, meterReading: string;

export const input = (over: Partial<TicketCreate> = {}): TicketCreate => ({
  type: "BUG",
  title: "Bill shows the wrong total",
  description: "Open account QA-001, the total is off.",
  areaId: null,
  severity: "S2",
  priority: "P2",
  foundIn: null, deviceType: null,
  assigneeId: null,
  ...over,
});

export const filters = (raw: Record<string, string> = {}) => ticketFilters.parse(raw);

/** Boots the database for this test file and resets it before each test. */
export function setUpTicketStoreDb() {
  beforeAll(async () => {
    ({ db, cleanup } = await createTestDb());
  });

  afterAll(async () => {
    await cleanup();
  });

  beforeEach(async () => {
    await db.ticket.deleteMany();
    await db.setting.deleteMany({ where: { key: "tickets.lastNumber" } });
    await db.areaMember.deleteMany();
    await db.erpArea.deleteMany({ where: { parentId: { not: null } } });
    await db.erpArea.deleteMany();
    await db.user.deleteMany();
    t = new Date("2026-10-29T00:00:00Z").getTime();

    const mk = async (name: string, role: "QA" | "DEV" | "ADMIN", active = true) => {
      const u = await db.user.create({ data: { name, email: `${name.toLowerCase().replace(/\W/g, "")}@x.ph`, passwordHash: "x", role, active } });
      return { id: u.id, role } as Actor;
    };
    qa = await mk("Ana QA", "QA");
    dev = await mk("Ben Dev", "DEV");
    dev2 = await mk("Cy Dev", "DEV");
    admin = await mk("Ada Admin", "ADMIN");
    billing = (await db.erpArea.create({ data: { name: "Billing" } })).id;
    meterReading = (await db.erpArea.create({ data: { name: "Meter Reading", parentId: billing } })).id;
  });
}

export type Store = ReturnType<typeof ticketStore>;

/** A finished upload: signed, then checked, as the upload routes do. Returns its id for a form to claim. */
export async function ready(s: Store, actor: Actor, f: { kind: "IMAGE" | "VIDEO"; storedName: string; originalName: string; mime: string; size: number; durationSec?: number | null }) {
  const { durationSec = null, ...rest } = f;
  const id = await s.pending.create(actor, rest);
  await s.pending.ready(id, { mime: f.mime, size: f.size, durationSec });
  return id;
}
export const img = (c: string) => ({ kind: "IMAGE" as const, storedName: "2026/10/" + c.repeat(32) + ".png", originalName: "x.png", mime: "image/png", size: 5 });
