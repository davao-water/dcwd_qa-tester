import { describe, expect, it } from "vitest";
import { ticketStore } from "@/lib/tickets/store";
import { db, now, qa, dev, dev2, admin, input, filters, setUpTicketStoreDb } from "./helpers/ticket-store-db";

// A ticket's category: set when filing, corrected by the developer, and filtered on.

setUpTicketStoreDb();

describe("ticket category", () => {
  it("saves the category chosen when filing, and an older ticket can have none", async () => {
    const s = ticketStore(db, now);
    const tagged = await s.create(qa, input({ category: "FRONT_END" }));
    const older = await s.create(qa, input());
    expect((await db.ticket.findUniqueOrThrow({ where: { id: tagged.id } })).category).toBe("FRONT_END");
    expect((await db.ticket.findUniqueOrThrow({ where: { id: older.id } })).category).toBeNull();
  });

  it("lets the assigned developer correct it, with a line in the log but nothing unread", async () => {
    const s = ticketStore(db, now);
    const { id } = await s.create(qa, input({ assigneeId: dev.id, category: "FRONT_END" }));
    const before = (await db.ticket.findUniqueOrThrow({ where: { id } })).lastActivityAt;

    await s.categorize(dev, id, "BACK_END");

    const after = await db.ticket.findUniqueOrThrow({ where: { id } });
    expect(after.category).toBe("BACK_END");
    expect(after.lastActivityAt).toEqual(before);
    expect(await db.ticketEvent.findFirstOrThrow({ where: { ticketId: id, field: "category" } })).toMatchObject({ kind: "FIELD", from: "Front-end", to: "Back-end", actorId: dev.id });
  });

  it("logs tagging an older ticket, and does nothing when the category is the same", async () => {
    const s = ticketStore(db, now);
    const { id } = await s.create(qa, input({ assigneeId: dev.id }));
    await s.categorize(admin, id, "UI_UX");
    await s.categorize(admin, id, "UI_UX");
    const events = await db.ticketEvent.findMany({ where: { ticketId: id, field: "category" } });
    expect(events.map((e) => [e.from, e.to])).toEqual([["Not tagged yet", "UI/UX"]]);
  });

  it("refuses a QA tester and a developer who isn't assigned", async () => {
    const s = ticketStore(db, now);
    const { id } = await s.create(qa, input({ assigneeId: dev.id }));
    await expect(s.categorize(qa, id, "BACK_END")).rejects.toThrow("Only the assigned developer or an admin");
    await expect(s.categorize(dev2, id, "BACK_END")).rejects.toThrow("no longer exists");
    expect((await db.ticket.findUniqueOrThrow({ where: { id } })).category).toBeNull();
  });

  it("filters the list by category and by not tagged yet", async () => {
    const s = ticketStore(db, now);
    await s.create(qa, input({ title: "Front one", category: "FRONT_END" }));
    await s.create(qa, input({ title: "Back one", category: "BACK_END" }));
    await s.create(qa, input({ title: "Older one" }));
    const titles = async (category: string) => (await s.list(filters({ category }), admin)).rows.map((r) => r.title);
    expect(await titles("FRONT_END")).toEqual(["Front one"]);
    expect(await titles("none")).toEqual(["Older one"]);
  });
});
