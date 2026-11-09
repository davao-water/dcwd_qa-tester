import { describe, expect, it } from "vitest";
import { BOARD_COLUMNS, boardColumnOf, columnInView, movesInto } from "@/lib/tickets/board";
import { allowedTransitions, TICKET_STATUSES, type Actor, type TicketRef, type TicketStatus } from "@/lib/tickets/workflow";

const qa: Actor = { id: "qa1", role: "QA" };
const dev: Actor = { id: "dev1", role: "DEV" };
const admin: Actor = { id: "adm", role: "ADMIN" };

const ticket = (status: TicketStatus): TicketRef => ({ status, reporterId: "qa1", assigneeId: "dev1" });
const into = (status: TicketStatus, u: Actor) => (column: Parameters<typeof movesInto>[0]) => movesInto(column, allowedTransitions(ticket(status), u)).map((m) => m.to);

describe("ticket board", () => {
  it("puts every status in exactly one column, in the order a ticket travels", () => {
    expect(BOARD_COLUMNS.map((c) => c.key)).toEqual(["todo", "doing", "info", "fixed", "done"]);
    const placed = BOARD_COLUMNS.flatMap((c) => c.statuses);
    expect([...placed].sort()).toEqual([...TICKET_STATUSES].sort());
    expect(boardColumnOf("NEW")).toBe("todo");
    expect(boardColumnOf("REOPENED")).toBe("todo");
    expect(boardColumnOf("NEED_INFO")).toBe("info");
    expect(boardColumnOf("WONT_FIX")).toBe("done");
    // Verified is no longer a step; tickets already Verified wait with the Fixed ones.
    expect(boardColumnOf("VERIFIED")).toBe("fixed");
  });

  it("offers the move the workflow allows into each column", () => {
    const devOnNew = into("NEW", dev);
    expect(devOnNew("doing")).toEqual(["IN_PROGRESS"]);
    expect(devOnNew("fixed")).toEqual(["FIXED"]);
    expect(devOnNew("info")).toEqual(["NEED_INFO"]);
    // Several ways to end it, so the board asks which. Not a bug is a reason inside Won't fix, not a choice here.
    expect(devOnNew("done")).toEqual(["DUPLICATE", "WONT_FIX"]);
    expect(devOnNew("todo")).toEqual([]);

    // Verify and close: a fixed card dropped on Done.
    expect(into("FIXED", qa)("done")).toEqual(["CLOSED"]);
    expect(into("FIXED", qa)("todo")).toEqual(["REOPENED"]);
    expect(into("VERIFIED", qa)("done")).toEqual(["CLOSED"]);
    expect(into("CLOSED", admin)("todo")).toEqual(["REOPENED"]);
    // Dragging back a column takes a mistaken move back.
    expect(into("IN_PROGRESS", dev)("todo")).toEqual(["NEW"]);
    expect(into("FIXED", dev)("doing")).toEqual(["IN_PROGRESS"]);
    expect(into("REJECTED", dev)("doing")).toEqual(["IN_PROGRESS"]);
  });

  it("offers nothing to someone who can't move the ticket", () => {
    const qaOnWork = into("IN_PROGRESS", qa);
    expect(BOARD_COLUMNS.flatMap((c) => qaOnWork(c.key))).toEqual(["DUPLICATE"]);
    const devOnVerified = into("VERIFIED", dev);
    expect(BOARD_COLUMNS.flatMap((c) => devOnVerified(c.key))).toEqual([]);
  });

  it("leaves the columns outside the chosen view empty, as the list does", () => {
    const inView = (group: "open" | "done" | "all", status: TicketStatus | "TO_START" | null = null) =>
      BOARD_COLUMNS.filter((c) => columnInView(c.key, { group, status })).map((c) => c.key);
    expect(inView("open")).toEqual(["todo", "doing", "info", "fixed"]);
    expect(inView("done")).toEqual(["done"]);
    expect(inView("all")).toHaveLength(5);
    expect(inView("open", "NEED_INFO")).toEqual(["info"]);
    expect(inView("open", "REOPENED")).toEqual(["todo"]);
    expect(inView("open", "TO_START")).toEqual(["todo"]);
  });
});
