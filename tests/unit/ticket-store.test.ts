import { describe, expect, it } from "vitest";
import { TicketError, ticketStore } from "@/lib/tickets/store";
import { db, now, tick, qa, dev, dev2, admin, billing, meterReading, input, ready, img, setUpTicketStoreDb } from "./helpers/ticket-store-db";

// Filing, moving, editing, assigning, commenting on and deleting tickets.

setUpTicketStoreDb();

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
    expect(d.closedAt?.getTime()).toBe(now().getTime());
    expect(d.lastActivityAt.getTime()).toBe(now().getTime());
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
    expect(d.lastActivityAt.getTime()).toBe(now().getTime());
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
});
