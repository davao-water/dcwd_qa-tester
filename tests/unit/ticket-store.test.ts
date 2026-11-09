import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { ticketFilters, type TicketCreate } from "@/lib/schemas/ticket";
import { areaPath } from "@/lib/areas/tree";
import { TicketError, ticketStore } from "@/lib/tickets/store";
import type { Actor } from "@/lib/tickets/workflow";
import { createTestDb } from "./helpers/test-db";

let db: PrismaClient;
let cleanup: () => Promise<void>;
let t = 0;
const now = () => new Date(t);
const tick = () => (t += 60_000);

let qa: Actor, dev: Actor, dev2: Actor, admin: Actor;
let billing: string, meterReading: string;

const input = (over: Partial<TicketCreate> = {}): TicketCreate => ({
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

const filters = (raw: Record<string, string> = {}) => ticketFilters.parse(raw);

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

type Store = ReturnType<typeof ticketStore>;

/** A finished upload: signed, then checked, as the upload routes do. Returns its id for a form to claim. */
async function ready(s: Store, actor: Actor, f: { kind: "IMAGE" | "VIDEO"; storedName: string; originalName: string; mime: string; size: number; durationSec?: number | null }) {
  const { durationSec = null, ...rest } = f;
  const id = await s.pending.create(actor, rest);
  await s.pending.ready(id, { mime: f.mime, size: f.size, durationSec });
  return id;
}
const img = (c: string) => ({ kind: "IMAGE" as const, storedName: "2026/10/" + c.repeat(32) + ".png", originalName: "x.png", mime: "image/png", size: 5 });

describe("ticketStore", () => {
  it("numbers tickets in order and records who filed and assigned them", async () => {
    const s = ticketStore(db, now);
    const a = await s.create(qa, input({ assigneeId: dev.id, areaId: meterReading }), [await ready(s, qa, img("a"))]);
    const b = await s.create(admin, input({ type: "SUGGESTION", severity: null }));
    expect([a.number, b.number]).toEqual([1, 2]);

    const detail = (await s.get(1, admin))!;
    expect(detail.reporter.name).toBe("Ana QA");
    expect(detail.assignee?.name).toBe("Ben Dev");
    expect(detail.area?.parent?.name).toBe("Billing");
    expect(detail.attachments).toHaveLength(1);
    expect(detail.events.map((e) => [e.kind, e.to])).toEqual([
      ["CREATED", null],
      ["ASSIGNEE", "Ben Dev"],
    ]);
  });

  it("refuses bad assignees, and developers filing tickets", async () => {
    const s = ticketStore(db, now);
    await expect(s.create(qa, input({ assigneeId: qa.id }))).rejects.toThrow(/active developer/);
    // Admins aren't developers: they can't be picked either.
    await expect(s.create(qa, input({ assigneeId: admin.id }))).rejects.toThrow(/active developer to assign/);
    await expect(s.create(dev, input())).rejects.toThrow(/can't file tickets/);
    const gone = await db.user.create({ data: { name: "Old Dev", email: "old@x.ph", passwordHash: "x", role: "DEV", active: false } });
    await expect(s.create(qa, input({ assigneeId: gone.id }))).rejects.toThrow(TicketError);
  });

  it("runs the full loop and keeps the timeline", async () => {
    const s = ticketStore(db, now);
    const { id } = await s.create(qa, input({ assigneeId: dev.id }));
    tick();
    await s.transition(dev, id, { to: "IN_PROGRESS", note: null, duplicateOf: null });
    tick();
    await s.transition(dev, id, { to: "NEED_INFO", note: "Which billing month?", duplicateOf: null });
    tick();
    await s.comment(qa, id, "October 2026.");
    tick();
    await s.transition(qa, id, { to: "IN_PROGRESS", note: null, duplicateOf: null });
    tick();
    await s.transition(dev, id, { to: "FIXED", note: "Rounding fixed in build 1.4.2", duplicateOf: null });
    tick();
    // Verify and close: one move.
    await s.transition(qa, id, { to: "CLOSED", note: null, duplicateOf: null });

    const d = (await s.get(1, admin))!;
    expect(d.status).toBe("CLOSED");
    expect(d.closedAt?.getTime()).toBe(t);
    expect(d.lastActivityAt.getTime()).toBe(t);
    expect(d.comments.map((c) => c.body)).toEqual(["October 2026."]);
    expect(d.events.filter((e) => e.kind === "STATUS").map((e) => `${e.from}→${e.to}`)).toEqual([
      "NEW→IN_PROGRESS",
      "IN_PROGRESS→NEED_INFO",
      "NEED_INFO→IN_PROGRESS",
      "IN_PROGRESS→FIXED",
      "FIXED→CLOSED",
    ]);
    expect(d.events.find((e) => e.to === "NEED_INFO")?.note).toBe("Which billing month?");

    tick();
    await s.transition(qa, id, { to: "REOPENED", note: "Still wrong for senior citizens", duplicateOf: null });
    expect((await s.get(1, admin))!.closedAt).toBeNull();
  });

  it("refuses moves the workflow forbids and needs notes", async () => {
    const s = ticketStore(db, now);
    const { id } = await s.create(qa, input({ assigneeId: dev.id }));
    // Another developer can't even see it; the assigned one can't skip the rules.
    await expect(s.transition(dev2, id, { to: "FIXED", note: null, duplicateOf: null })).rejects.toThrow(/no longer exists/);
    await expect(s.transition(dev, id, { to: "VERIFIED", note: null, duplicateOf: null })).rejects.toThrow(/can't move/);
    await expect(s.transition(qa, id, { to: "FIXED", note: null, duplicateOf: null })).rejects.toThrow(TicketError);
    await expect(s.transition(dev, id, { to: "REJECTED", note: null, duplicateOf: null })).rejects.toThrow(/note/);
  });

  it("marks duplicates against an existing other ticket", async () => {
    const s = ticketStore(db, now);
    await s.create(qa, input());
    const { id } = await s.create(qa, input({ assigneeId: dev.id }));
    await expect(s.transition(dev, id, { to: "DUPLICATE", note: null, duplicateOf: 99 })).rejects.toThrow(/no ticket #99/);
    await expect(s.transition(dev, id, { to: "DUPLICATE", note: null, duplicateOf: 2 })).rejects.toThrow(/itself/);
    await s.transition(dev, id, { to: "DUPLICATE", note: null, duplicateOf: 1 });
    const d = (await s.get(2, admin))!;
    expect(d.duplicateOf?.number).toBe(1);
    expect(d.events.at(-1)?.note).toBe("Duplicate of #1.");

    // Taken back by mistake: working on it again, no longer a duplicate, not closed.
    await s.transition(dev, id, { to: "IN_PROGRESS", note: "Not the same bug after all", duplicateOf: null });
    const back = (await s.get(2, admin))!;
    expect(back).toMatchObject({ status: "IN_PROGRESS", duplicateOf: null, closedAt: null });
    expect(back.events.at(-1)).toMatchObject({ kind: "STATUS", from: "DUPLICATE", to: "IN_PROGRESS", note: "Not the same bug after all" });
  });

  it("refuses a move when the status changed underneath", async () => {
    const s = ticketStore(db, now);
    const { id } = await s.create(qa, input({ assigneeId: dev.id }));
    await db.ticket.update({ where: { id }, data: { status: "VERIFIED" } });
    // The dev's page still thinks it is NEW, but the store reloads, so the move is checked against VERIFIED.
    await expect(s.transition(dev, id, { to: "IN_PROGRESS", note: null, duplicateOf: null })).rejects.toThrow(/can't move/);
  });

  it("edits only as the reporter or an admin, with one event per changed field", async () => {
    const s = ticketStore(db, now);
    const { id } = await s.create(qa, input({ assigneeId: dev.id }));
    const edit = { type: "BUG" as const, title: "Bill total is wrong for seniors", description: "New text", areaId: billing, severity: "S1" as const, priority: "P2" as const, foundIn: null, deviceType: null };
    // The assigned developer sees the ticket but can't edit it.
    await expect(s.update(dev, id, edit)).rejects.toThrow(/Only the person who filed/);
    expect(await s.update(qa, id, edit)).toBe(4);
    const fields = (await s.get(1, admin))!.events.filter((e) => e.kind === "FIELD");
    expect(fields.map((e) => [e.field, e.from, e.to])).toEqual([
      ["title", "Bill shows the wrong total", "Bill total is wrong for seniors"],
      ["description", null, null],
      ["module", null, "Billing"],
      ["severity", "S2 Major", "S1 Critical"],
    ]);
    expect(await s.update(admin, id, edit)).toBe(0);
  });

  it("reassigns with names in the timeline", async () => {
    const s = ticketStore(db, now);
    const { id } = await s.create(qa, input({ assigneeId: dev.id }));
    await expect(s.assign(dev, id, dev2.id)).rejects.toThrow(/Only QA testers and admins/);
    await s.assign(qa, id, dev2.id, "  Ben is on leave ");
    await s.assign(qa, id, dev2.id, "again"); // no-op
    await s.assign(admin, id, null);
    const evs = (await s.get(1, admin))!.events.filter((e) => e.kind === "ASSIGNEE");
    expect(evs.map((e) => [e.from, e.to, e.note])).toEqual([
      [null, "Ben Dev", null],
      ["Ben Dev", "Cy Dev", "Ben is on leave"],
      ["Cy Dev", null, null],
    ]);
  });

  it("hands a ticket back to QA unassigned, with who the developer recommends", async () => {
    const s = ticketStore(db, now);
    const { id } = await s.create(qa, input({ assigneeId: dev.id }));
    await s.transition(dev, id, { to: "IN_PROGRESS", note: null, duplicateOf: null });
    tick();
    // Only the assigned developer, with a reason, and recommending someone else (a developer).
    await expect(s.handBack(dev2, id, { recommendId: null, note: "x" })).rejects.toThrow(/no longer exists/);
    await expect(s.handBack(dev, id, { recommendId: null, note: " " })).rejects.toThrow(/note/);
    await expect(s.handBack(dev, id, { recommendId: dev.id, note: "x" })).rejects.toThrow(/different developer/);
    await expect(s.handBack(dev, id, { recommendId: admin.id, note: "x" })).rejects.toThrow(/active developer/);

    expect(await s.handBack(dev, id, { recommendId: dev2.id, note: "It's in the payroll code Cy owns." })).toEqual({ recommended: "Cy Dev" });
    const d = (await s.get(1, admin))!;
    // Still open, back to New for QA to reassign.
    expect(d.status).toBe("NEW");
    expect(d.assigneeId).toBeNull();
    expect(d.lastActivityAt.getTime()).toBe(t);
    const assigneeEvent = d.events.filter((e) => e.kind === "ASSIGNEE").at(-1)!;
    expect(assigneeEvent).toMatchObject({ from: "Ben Dev", to: null, note: "Recommends Cy Dev. It's in the payroll code Cy owns." });
    expect(d.events.filter((e) => e.kind === "STATUS").at(-1)).toMatchObject({ from: "IN_PROGRESS", to: "NEW" });

    // Once nobody is assigned, there is nobody to hand it back from; QA assigns it.
    await expect(s.handBack(admin, id, { recommendId: null, note: "x" })).rejects.toThrow(/Only the assigned developer/);
    await s.assign(qa, id, dev2.id);
    expect((await s.get(1, admin))!.assigneeId).toBe(dev2.id);
  });

  it("closes with Not a bug as Rejected, from inside Won't fix", async () => {
    const s = ticketStore(db, now);
    const { id } = await s.create(qa, input({ assigneeId: dev.id }));
    await s.transition(dev, id, { to: "REJECTED", note: "Works as the business rule says", duplicateOf: null });
    expect((await s.get(1, admin))!.status).toBe("REJECTED");
  });

  it("needs text or an image for a comment", async () => {
    const s = ticketStore(db, now);
    const { id } = await s.create(qa, input({ assigneeId: dev.id }));
    await expect(s.comment(dev, id, "   ")).rejects.toThrow(/Write a message/);
    await s.comment(dev, id, "", [await ready(s, dev, img("b"))]);
    const d = (await s.get(1, admin))!;
    expect(d.comments[0].attachments).toHaveLength(1);
    expect(d.attachments).toHaveLength(0);
  });

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
        lastActivityAt: new Date(t + i * 1000),
        closedAt: new Date(t + i * 1000),
      })),
    });
    const done = (await s.board(filters({ group: "done" }), admin)).find((c) => c.key === "done")!;
    expect(done.total).toBe(53);
    expect(done.rows).toHaveLength(50);
    expect(done.rows[0].number).toBe(53);
  });

  it("gives out a ticket's attachments to anyone who may read tickets", async () => {
    const s = ticketStore(db, now);
    const file = img("c");
    await s.create(qa, input({ assigneeId: dev.id }), [await ready(s, qa, file)]);
    const att = await db.attachment.findFirstOrThrow();
    expect(await s.attachmentFor(qa, att.id)).toMatchObject({ storedName: file.storedName });
    expect(await s.attachmentFor(dev, att.id)).not.toBeNull();
    // Not assigned to them, but readable from the All tab.
    expect(await s.attachmentFor(dev2, att.id)).not.toBeNull();
    expect(await s.attachmentFor(admin, att.id)).not.toBeNull();
    expect(await s.attachmentFor(admin, "missing")).toBeNull();
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
    t = Date.parse("2026-10-28T15:30:00Z");
    await s.create(qa, input({ title: "Late on the 28th", severity: "S1", priority: "P1" }));
    t = Date.parse("2026-10-29T00:00:00Z");
    await s.create(qa, input({ title: "Morning of the 29th", severity: "S3", priority: "P3" }));
    t = Date.parse("2026-10-30T16:30:00Z"); // 00:30 on the 31st in Manila
    await s.create(admin, input({ title: "Just after midnight on the 31st", type: "SUGGESTION", severity: null, priority: "P1" }));

    const list = async (raw: Record<string, string>) => (await s.list(filters({ group: "all", ...raw }), admin)).rows.map((r) => r.title).sort();
    expect(await list({ severity: "S1" })).toEqual(["Late on the 28th"]);
    expect(await list({ priority: "P1" })).toEqual(["Just after midnight on the 31st", "Late on the 28th"]);
    expect(await list({ reporter: qa.id })).toEqual(["Late on the 28th", "Morning of the 29th"]);
    expect(await list({ from: "2026-10-29" })).toEqual(["Just after midnight on the 31st", "Morning of the 29th"]);
    expect(await list({ to: "2026-10-28" })).toEqual(["Late on the 28th"]);
    expect(await list({ from: "2026-10-29", to: "2026-10-30" })).toEqual(["Morning of the 29th"]);
  });

  it("deletes permanently only for the filing QA tester or an admin, after the exact title is typed", async () => {
    const s = ticketStore(db, now);
    const { id } = await s.create(qa, input({ title: "Bill shows the wrong total", assigneeId: dev.id }), [await ready(s, qa, img("d"))]);
    await s.comment(dev, id, "Looking", [await ready(s, dev, img("e"))]);
    const other = await s.create(qa, input({ title: "Another one" }));
    await s.transition(qa, other.id, { to: "DUPLICATE", note: null, duplicateOf: 1 });

    await expect(s.delete(dev, id, "Bill shows the wrong total")).rejects.toThrow(/Only the QA tester who filed/);
    await expect(s.delete(qa, id, "bill shows the wrong total")).rejects.toThrow(/doesn't match/);
    await expect(s.delete(qa, id, "")).rejects.toThrow(/doesn't match/);

    const r = await s.delete(qa, id, "  Bill shows the wrong total ");
    expect(r.number).toBe(1);
    expect(r.files.map((f) => f.storedName).sort()).toEqual(["2026/10/" + "d".repeat(32) + ".png", "2026/10/" + "e".repeat(32) + ".png"]);
    expect(await db.ticket.count({ where: { id } })).toBe(0);
    expect(await db.ticketComment.count({ where: { ticketId: id } })).toBe(0);
    expect(await db.ticketEvent.count({ where: { ticketId: id } })).toBe(0);
    expect(await db.attachment.count({ where: { ticketId: id } })).toBe(0);
    // The ticket that pointed at it as a duplicate stays, without the link.
    expect((await db.ticket.findUniqueOrThrow({ where: { id: other.id } })).duplicateOfId).toBeNull();

    // Numbers are never reused: deleting the newest (#2) and filing again gives #3.
    await s.delete(qa, other.id, "Another one");
    expect((await s.create(qa, input())).number).toBe(3);
  });

  it("attaches a finished upload only for the person who uploaded it, once", async () => {
    const s = ticketStore(db, now);
    const vid = (c: string) => ({ kind: "VIDEO" as const, storedName: `2026/10/${c.repeat(32)}.mp4`, originalName: "repro.mp4", mime: "video/mp4", size: 5_000_000, durationSec: 42 });
    const mine = await ready(s, qa, vid("a"));
    const devs = await ready(s, dev, vid("b"));

    // Someone else's upload is refused, and nothing is filed.
    await expect(s.create(qa, input(), [devs])).rejects.toThrow(TicketError);
    expect(await db.ticket.count()).toBe(0);

    const tk = await s.create(qa, input(), [mine]);
    const detail = (await s.get(tk.number, qa))!;
    expect(detail.attachments.map((a) => [a.kind, a.originalName, a.durationSec])).toEqual([["VIDEO", "repro.mp4", 42]]);
    expect(await db.pendingUpload.count({ where: { id: mine } })).toBe(0);
    // Already claimed: can't be attached twice.
    await expect(s.comment(qa, tk.id, "again", [mine])).rejects.toThrow(/expired/);

    // A reply can be just a video.
    await s.assign(qa, tk.id, dev.id);
    await s.comment(dev, tk.id, "", [devs]);
    const after = (await s.get(tk.number, dev))!;
    expect(after.comments[0].attachments.map((a) => a.kind)).toEqual(["VIDEO"]);
    expect(await s.attachmentFor(dev, after.comments[0].attachments[0].id)).toMatchObject({ mime: "video/mp4" });
  });

  it("refuses an upload that hasn't finished, and more than one video or six images", async () => {
    const s = ticketStore(db, now);
    const signed = await s.pending.create(qa, img("f"));
    await expect(s.create(qa, input(), [signed])).rejects.toThrow(/didn't finish/);

    const vid = (c: string) => ({ kind: "VIDEO" as const, storedName: `2026/10/${c.repeat(32)}.mp4`, originalName: "r.mp4", mime: "video/mp4", size: 10 });
    const two = [await ready(s, qa, vid("1")), await ready(s, qa, vid("2"))];
    await expect(s.create(qa, input(), two)).rejects.toThrow(/at most 1 video/);
    const seven = await Promise.all(["3", "4", "5", "6", "7", "8", "9"].map((c) => ready(s, qa, img(c))));
    await expect(s.create(qa, input(), seven)).rejects.toThrow(/at most 6 images/);
    expect(await db.ticket.count()).toBe(0);
  });

  it("limits how many uploads one person may have waiting", async () => {
    const s = ticketStore(db, now);
    for (let i = 0; i < 20; i++) await s.pending.create(qa, img(i.toString(16).padStart(2, "0")));
    await expect(s.pending.create(qa, img("ff"))).rejects.toThrow(/too many files waiting/);
    expect(await s.pending.create(dev, img("ee"))).toBeTruthy();
  });

  it("removes your own pending video and sweeps old ones", async () => {
    const s = ticketStore(db, now);
    const vid = (c: string) => ({ kind: "VIDEO" as const, storedName: `2026/10/${c.repeat(32)}.webm`, originalName: "r.webm", mime: "video/webm", size: 10 });
    const a = await s.pending.create(qa, vid("c"));
    expect(await s.pending.remove(dev, a)).toBeNull();
    expect(await s.pending.remove(qa, a)).toEqual({ storedName: vid("c").storedName });

    await s.pending.create(qa, vid("d"));
    t += 23 * 3_600_000;
    await s.pending.create(qa, vid("e"));
    expect(await s.pending.sweep()).toEqual([]);
    t += 2 * 3_600_000;
    expect(await s.pending.sweep()).toEqual([{ storedName: vid("d").storedName }]);
    expect(await db.pendingUpload.count()).toBe(1);
  });
});

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
