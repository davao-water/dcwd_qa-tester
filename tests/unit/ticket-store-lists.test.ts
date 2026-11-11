import { describe, expect, it } from "vitest";
import { areaPath } from "@/lib/areas/tree";
import { ticketStore } from "@/lib/tickets/store";
import type { Actor } from "@/lib/tickets/workflow";
import { db, now, tick, setClock, qa, dev, dev2, admin, billing, meterReading, input, filters, setUpTicketStoreDb } from "./helpers/ticket-store-db";

// The tickets list, its tabs and filters, the board, and the view counts.

setUpTicketStoreDb();

describe("ticketStore lists", () => {
  it("filters the list by group, status, module, people and search", async () => {
    const s = ticketStore(db, now);
    const one = await s.create(qa, input({ title: "Payroll tax off by one", areaId: billing, assigneeId: dev.id }));
    tick();
    await s.create(qa, input({ title: "Meter reading screen slow", areaId: meterReading, assigneeId: dev2.id }));
    tick();
    const three = await s.create(admin, input({ title: "Export button misaligned", type: "IMPROVEMENT", severity: null }));
    tick();
    await s.transition(dev, one.id, { to: "FIXED", note: null, duplicateOf: null });
    await s.transition(admin, three.id, { to: "CLOSED", note: "Filed by mistake", duplicateOf: null });

    const titles = async (raw: Record<string, string>, who: Actor = admin) => (await s.list(filters(raw), who)).rows.map((r) => r.number);
    expect(await titles({})).toEqual([1, 2]); // open, newest activity first
    expect(await titles({ group: "done" })).toEqual([3]);
    expect(await titles({ group: "all" })).toEqual([3, 1, 2]); // #1 and #3 moved at the same time: the newer ticket first
    expect(await titles({ status: "FIXED", reporter: "me" }, qa)).toEqual([1]);
    expect(await titles({ area: billing })).toEqual([1, 2]); // includes sub-modules
    expect(await titles({ area: meterReading })).toEqual([2]);
    expect(await titles({ assignee: "me" }, admin)).toEqual([]);
    expect(await titles({ group: "all", assignee: "none" })).toEqual([3]);
    expect(await titles({ group: "all", type: "IMPROVEMENT" })).toEqual([3]);
    expect(await titles({ q: "meter" })).toEqual([2]);
    expect(await titles({ group: "all", q: "#3" })).toEqual([3]);
    expect((await s.list(filters({ group: "all" }), admin)).total).toBe(3);
  });

  it("keeps QA testers' and developers' own tabs to their own tickets, and shows everyone every ticket on All", async () => {
    const s = ticketStore(db, now);
    const qa2: Actor = { id: (await db.user.create({ data: { name: "Bea QA", email: "bea@x.ph", passwordHash: "x", role: "QA" } })).id, role: "QA" };
    const mine = await s.create(qa, input({ title: "Ana's bug", assigneeId: dev.id }));
    const theirs = await s.create(qa2, input({ title: "Bea's bug", assigneeId: dev2.id }));
    await s.create(admin, input({ title: "Unassigned" }));

    const list = async (who: Actor, raw: Record<string, string> = {}) => (await s.list(filters(raw), who)).rows.map((r) => r.title);
    // Own tabs (Open, Done, a status): only your own.
    expect(await list(qa)).toEqual(["Ana's bug"]);
    expect(await list(qa2)).toEqual(["Bea's bug"]);
    expect(await list(dev)).toEqual(["Ana's bug"]);
    expect(await list(dev2, { group: "open", status: "NEW" })).toEqual(["Bea's bug"]);
    expect(await list(admin)).toHaveLength(3);
    // A filter can narrow the own tabs but never widen them.
    expect(await list(qa, { reporter: qa2.id })).toEqual([]);
    expect(await list(dev, { assignee: dev2.id })).toEqual([]);
    // The All tab: every ticket for everyone, and the QA tester and developer filters pick from all of them.
    for (const who of [qa, qa2, dev, dev2, admin]) expect(await list(who, { group: "all" })).toHaveLength(3);
    expect(await list(qa, { group: "all", reporter: qa2.id })).toEqual(["Bea's bug"]);
    expect(await list(dev, { group: "all", assignee: dev2.id })).toEqual(["Bea's bug"]);
    expect(await s.viewCounts(filters(), qa, [{ group: "open", status: null, assignee: null, reporter: null }, { group: "all", status: null, assignee: null, reporter: null }])).toEqual([1, 3]);

    // Anyone may read another person's ticket and reply to it…
    expect((await s.get(2, qa))?.title).toBe("Bea's bug");
    expect((await s.get(2, dev))?.title).toBe("Bea's bug");
    await s.comment(qa, theirs.id, "Seen this on my side too");
    await s.comment(dev, theirs.id, "Looks like the same cause as #1");
    expect(await db.ticketComment.count({ where: { ticketId: theirs.id } })).toBe(2);
    // …but not change it.
    await expect(s.transition(dev, theirs.id, { to: "IN_PROGRESS", note: null, duplicateOf: null })).rejects.toThrow(/no longer exists/);
    await expect(s.transition(qa, theirs.id, { to: "CLOSED", note: "x", duplicateOf: null })).rejects.toThrow(/no longer exists/);
    await expect(s.assign(qa, theirs.id, dev.id)).rejects.toThrow(/no longer exists/);
    await expect(s.update(qa, theirs.id, { ...input({ title: "Renamed by Ana" }) })).rejects.toThrow(/no longer exists/);
    await expect(s.delete(qa, theirs.id, "Bea's bug")).rejects.toThrow(/no longer exists/);
    await expect(s.categorize(dev, theirs.id, "UI_UX")).rejects.toThrow(/no longer exists/);

    // Reassigning takes the ticket off the old developer's own list.
    await s.assign(qa, mine.id, dev2.id);
    expect(await list(dev)).toEqual([]);
    // Same activity time (the test clock stands still): the newer ticket comes first.
    expect(await list(dev2)).toEqual(["Bea's bug", "Ana's bug"]);

    expect(await s.counts(qa)).toMatchObject({ open: 1, toStart: 1, fixed: 0 });
    expect(await s.total(qa)).toBe(1);
    expect(await s.total(admin)).toBe(3);
    expect((await s.recent(dev2)).map((r) => r.title)).toEqual(["Bea's bug", "Ana's bug"]);
  });

  it("lays the board out by stage, within the person's scope and filters", async () => {
    const s = ticketStore(db, now);
    const one = await s.create(qa, input({ title: "Payroll tax off by one", areaId: billing, assigneeId: dev.id }));
    tick();
    const two = await s.create(qa, input({ title: "Meter reading screen slow", areaId: meterReading, assigneeId: dev.id }));
    tick();
    const three = await s.create(qa, input({ title: "Export button misaligned", type: "IMPROVEMENT", severity: null, assigneeId: dev2.id }));
    tick();
    await s.create(admin, input({ title: "Login page typo" }));
    tick();
    await s.transition(dev, one.id, { to: "FIXED", note: null, duplicateOf: null });
    await s.transition(qa, one.id, { to: "REOPENED", note: "Still off", duplicateOf: null });
    tick();
    await s.transition(dev, two.id, { to: "IN_PROGRESS", note: null, duplicateOf: null });
    await s.transition(dev2, three.id, { to: "WONT_FIX", note: "By design", duplicateOf: null });

    const board = async (who: Actor, raw: Record<string, string> = {}) =>
      Object.fromEntries((await s.board(filters(raw), who)).map((c) => [c.key, { total: c.total, numbers: c.rows.map((r) => r.number) }]));

    // Reopened sits in To do with the new ones; Won't fix is Done. Newest activity first.
    expect(await board(admin, { group: "all" })).toEqual({
      todo: { total: 2, numbers: [1, 4] },
      doing: { total: 1, numbers: [2] },
      info: { total: 0, numbers: [] },
      fixed: { total: 0, numbers: [] },
      done: { total: 1, numbers: [3] },
    });
    // The same views as the list: Open (the default) leaves Done empty, Done and one status narrow it.
    expect(await board(admin)).toMatchObject({ todo: { total: 2 }, doing: { total: 1 }, done: { total: 0, numbers: [] } });
    expect(await board(admin, { group: "done" })).toMatchObject({ todo: { total: 0 }, doing: { total: 0 }, done: { numbers: [3] } });
    expect(await board(admin, { status: "IN_PROGRESS" })).toMatchObject({ todo: { total: 0 }, doing: { numbers: [2] } });
    // Developers see their assignments, QA testers what they filed; on All, everyone sees every ticket.
    expect(await board(dev)).toMatchObject({ todo: { numbers: [1] }, doing: { numbers: [2] }, done: { total: 0 } });
    expect(await board(dev, { group: "done" })).toMatchObject({ done: { total: 0 } });
    expect(await board(qa, { group: "done" })).toMatchObject({ done: { numbers: [3] } });
    expect(await board(dev, { group: "all" })).toMatchObject({ todo: { numbers: [1, 4] }, done: { numbers: [3] } });
    // Module, type, people and search filter too.
    expect(await board(admin, { area: billing })).toMatchObject({ todo: { numbers: [1] }, doing: { numbers: [2] } });
    expect(await board(admin, { group: "all", type: "IMPROVEMENT" })).toMatchObject({ todo: { total: 0 }, done: { numbers: [3] } });
    expect(await board(admin, { assignee: "none" })).toMatchObject({ todo: { numbers: [4] }, doing: { total: 0 } });
    expect(await board(admin, { q: "#4" })).toMatchObject({ todo: { numbers: [4] }, doing: { total: 0 } });
  });

  it("shows a column's 50 most recent tickets on the board and counts the rest", async () => {
    const s = ticketStore(db, now);
    await db.ticket.createMany({
      data: Array.from({ length: 53 }, (_, i) => ({
        number: i + 1,
        type: "BUG" as const,
        title: `Closed ${i + 1}`,
        description: "x",
        status: "CLOSED" as const,
        reporterId: qa.id,
        lastActivityAt: new Date(now().getTime() + i * 1000),
        closedAt: new Date(now().getTime() + i * 1000),
      })),
    });
    const done = (await s.board(filters({ group: "done" }), admin)).find((c) => c.key === "done")!;
    expect(done.total).toBe(53);
    expect(done.rows).toHaveLength(50);
    expect(done.rows[0].number).toBe(53);
  });

  it("filters by a module or sub-module with everything inside it, three levels deep", async () => {
    const s = ticketStore(db, now);
    const upload = (await db.erpArea.create({ data: { name: "Reading Upload", parentId: meterReading } })).id;
    await s.create(qa, input({ title: "On the module", areaId: billing }));
    await s.create(qa, input({ title: "On the sub-module", areaId: meterReading }));
    await s.create(qa, input({ title: "On the third level", areaId: upload }));
    await s.create(qa, input({ title: "No module" }));
    const list = async (area: string) => (await s.list(filters({ group: "all", area }), admin)).rows.map((r) => r.title).sort();
    expect(await list(billing)).toEqual(["On the module", "On the sub-module", "On the third level"]);
    expect(await list(meterReading)).toEqual(["On the sub-module", "On the third level"]);
    expect(await list(upload)).toEqual(["On the third level"]);
    // The list names it by its whole path.
    const row = (await s.list(filters({ group: "all", area: upload }), admin)).rows[0];
    expect(areaPath(row.area!)).toBe("Billing › Meter Reading › Reading Upload");
  });

  it("filters by severity, priority, QA tester and the day filed (Manila time)", async () => {
    const s = ticketStore(db, now);
    // 2026-10-29 08:00 Manila is 00:00 UTC; 23:30 the day before in Manila is 15:30 UTC on the 28th.
    setClock(Date.parse("2026-10-28T15:30:00Z"));
    await s.create(qa, input({ title: "Late on the 28th", severity: "S1", priority: "P1" }));
    setClock(Date.parse("2026-10-29T00:00:00Z"));
    await s.create(qa, input({ title: "Morning of the 29th", severity: "S3", priority: "P3" }));
    setClock(Date.parse("2026-10-30T16:30:00Z")); // 00:30 on the 31st in Manila
    await s.create(admin, input({ title: "Just after midnight on the 31st", type: "SUGGESTION", severity: null, priority: "P1" }));

    const list = async (raw: Record<string, string>) => (await s.list(filters({ group: "all", ...raw }), admin)).rows.map((r) => r.title).sort();
    expect(await list({ severity: "S1" })).toEqual(["Late on the 28th"]);
    expect(await list({ priority: "P1" })).toEqual(["Just after midnight on the 31st", "Late on the 28th"]);
    expect(await list({ reporter: qa.id })).toEqual(["Late on the 28th", "Morning of the 29th"]);
    expect(await list({ from: "2026-10-29" })).toEqual(["Just after midnight on the 31st", "Morning of the 29th"]);
    expect(await list({ to: "2026-10-28" })).toEqual(["Late on the 28th"]);
    expect(await list({ from: "2026-10-29", to: "2026-10-30" })).toEqual(["Morning of the 29th"]);
  });
});

describe("view counts", () => {
  it("counts each view tab within the person's scope, with the other filters applied", async () => {
    const s = ticketStore(db, now);
    const one = await s.create(qa, input({ title: "Payroll tax", type: "BUG", assigneeId: dev.id }));
    await s.create(qa, input({ title: "Meter screen", type: "IMPROVEMENT", severity: null, assigneeId: dev.id }));
    await s.create(admin, input({ title: "Export button", type: "BUG" }));
    await s.transition(dev, one.id, { to: "NEED_INFO", note: "Which month?", duplicateOf: null });

    const views = [
      { group: "open" as const, status: null, assignee: null, reporter: null },
      { group: "open" as const, status: "NEED_INFO" as const, assignee: null, reporter: null },
      { group: "all" as const, status: null, assignee: null, reporter: "me" },
    ];
    expect(await s.viewCounts(filters(), admin, views)).toEqual([3, 1, 1]);
    // QA sees only their own tickets; a type filter narrows every tab.
    expect(await s.viewCounts(filters(), qa, views)).toEqual([2, 1, 2]);
    expect(await s.viewCounts(filters({ type: "BUG" }), admin, views)).toEqual([2, 1, 1]);
    // A view's own people replace the page's: here every view says "anyone", so a developer filter doesn't narrow them.
    expect(await s.viewCounts(filters({ assignee: dev2.id }), admin, views)).toEqual([3, 1, 1]);
    // When the page passes the developer filter along in each view, the counts follow it.
    expect(await s.viewCounts(filters(), admin, views.map((v) => ({ ...v, assignee: dev2.id })))).toEqual([0, 0, 0]);
  });
});

describe("not started filter", () => {
  it("lists new and reopened tickets together", async () => {
    const s = ticketStore(db, now);
    const one = await s.create(qa, input({ title: "New one", assigneeId: dev.id }));
    const two = await s.create(qa, input({ title: "Reopened one", assigneeId: dev.id }));
    await s.create(qa, input({ title: "Working one", assigneeId: dev.id }));
    await s.transition(dev, two.id, { to: "FIXED", note: null, duplicateOf: null });
    await s.transition(qa, two.id, { to: "REOPENED", note: "Still off", duplicateOf: null });
    await s.transition(dev, (await db.ticket.findFirstOrThrow({ where: { title: "Working one" } })).id, { to: "IN_PROGRESS", note: null, duplicateOf: null });
    const titles = (await s.list(filters({ status: "TO_START" }), dev)).rows.map((r) => r.title).sort();
    expect(titles).toEqual(["New one", "Reopened one"]);
    expect(one.number).toBe(1);
  });
});
