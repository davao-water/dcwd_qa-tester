import { describe, expect, it } from "vitest";
import { ticketStore } from "@/lib/tickets/store";
import type { Actor } from "@/lib/tickets/workflow";
import { db, now, qa, dev, dev2, billing, meterReading, input, type Store, setUpTicketStoreDb } from "./helpers/ticket-store-db";

// Module progress on the dashboard.

setUpTicketStoreDb();

describe("module progress", () => {
  const move = (s: Store, who: Actor, id: string, to: Parameters<Store["transition"]>[2]["to"], note: string | null = null) => s.transition(who, id, { to, note, duplicateOf: null });
  const card = async (s: Store, forUserId?: string) => (await s.moduleProgress(forUserId)).cards.find((c) => c.name === "Billing")!;

  it("counts every ticket, rolls sub-modules up, and leaves out withdrawn ones", async () => {
    const s = ticketStore(db, now);
    const a = await s.create(qa, input({ areaId: billing, category: "FRONT_END", assigneeId: dev.id }));
    await s.create(qa, input({ areaId: meterReading, category: "FRONT_END", assigneeId: dev2.id }));
    const w = await s.create(qa, input({ areaId: billing, category: "BACK_END" }));
    await s.create(qa, input({ areaId: billing }));

    // A new ticket starts at 0 of 2.
    expect((await card(s)).categories.FRONT_END).toEqual({ done: 0, total: 2, pct: 0 });
    expect((await card(s)).untagged).toBe(1);

    // Closed after Verified counts as done; Verified alone doesn't.
    await move(s, dev, a.id, "FIXED");
    expect((await card(s)).categories.FRONT_END).toEqual({ done: 0, total: 2, pct: 0 });
    await move(s, qa, a.id, "CLOSED");
    expect((await card(s)).categories.FRONT_END).toEqual({ done: 1, total: 2, pct: 50 });
    // The module's fair score: 1 closed of 3 tagged, with 5 needed for full credit.
    expect((await card(s)).score).toEqual({ done: 1, total: 3, pct: 20 });

    // Withdrawn leaves both numbers, and counts again once reopened.
    await move(s, qa, w.id, "CLOSED", "Filed by mistake");
    expect((await card(s)).categories.BACK_END).toEqual({ done: 0, total: 0, pct: 0 });
    await move(s, qa, w.id, "REOPENED", "It was real");
    expect((await card(s)).categories.BACK_END).toEqual({ done: 0, total: 1, pct: 0 });

    // Reopening a closed one lowers it again.
    await move(s, qa, a.id, "REOPENED", "Back again");
    expect((await card(s)).categories.FRONT_END).toEqual({ done: 0, total: 2, pct: 0 });
  });

  it("follows a ticket moved to another module, and leaves out rejected ones", async () => {
    const s = ticketStore(db, now);
    const other = (await db.erpArea.create({ data: { name: "Payroll" } })).id;
    const t1 = await s.create(qa, input({ areaId: billing, category: "UI_UX", assigneeId: dev.id }));
    const t2 = await s.create(qa, input({ areaId: billing, category: "UI_UX", assigneeId: dev.id }));
    await move(s, dev, t2.id, "REJECTED", "Works as designed");
    expect((await card(s)).categories.UI_UX).toEqual({ done: 0, total: 1, pct: 0 });

    await db.ticket.update({ where: { id: t1.id }, data: { areaId: other } });
    const { cards, total } = await s.moduleProgress();
    expect(total).toBe(2);
    expect(cards.find((c) => c.name === "Billing")!.categories.UI_UX).toEqual({ done: 0, total: 0, pct: 0 });
    expect(cards.find((c) => c.name === "Payroll")!.categories.UI_UX).toEqual({ done: 0, total: 1, pct: 0 });
    // Payroll has tickets, so it comes before Billing, which has none.
    expect(cards.map((c) => c.name)).toEqual(["Payroll", "Billing"]);
  });

  it("keeps a person's modules, including through a sub-module", async () => {
    const s = ticketStore(db, now);
    await db.erpArea.create({ data: { name: "Payroll" } });
    await db.areaMember.create({ data: { userId: qa.id, areaId: meterReading } });
    const mine = await s.moduleProgress(qa.id);
    expect(mine.cards.map((c) => c.name)).toEqual(["Billing"]);
    expect(mine.total).toBe(2);
    expect((await s.moduleProgress(dev.id)).cards).toEqual([]);
  });
});
