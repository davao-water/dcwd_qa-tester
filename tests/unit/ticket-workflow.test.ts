import { describe, expect, it } from "vitest";
import {
  allowedTransitions,
  canAssign,
  canAssignTicket,
  canHandBack,
  canReadTicket,
  canDeleteTicket,
  canEditTicket,
  canSeeTicket,
  isDone,
  OPEN_STATUSES,
  TICKET_STATUSES,
  TICKET_TYPES,
  TYPE_TONES,
  ticketScope,
  transitionError,
  type Actor,
  type TicketRef,
  type TicketStatus,
  foundInOptions,
  canCategorize,
} from "@/lib/tickets/workflow";

const qa: Actor = { id: "qa1", role: "QA" };
const otherQa: Actor = { id: "qa2", role: "QA" };
const dev: Actor = { id: "dev1", role: "DEV" };
const otherDev: Actor = { id: "dev2", role: "DEV" };
const admin: Actor = { id: "adm", role: "ADMIN" };

const ticket = (status: TicketStatus, assigneeId: string | null = "dev1"): TicketRef => ({ status, reporterId: "qa1", assigneeId });
const moves = (t: TicketRef, u: Actor) => allowedTransitions(t, u).map((m) => m.to);

describe("ticket workflow", () => {
  it("lets the assigned developer work a new ticket", () => {
    expect(moves(ticket("NEW"), dev)).toEqual(["IN_PROGRESS", "FIXED", "NEED_INFO", "DUPLICATE", "WONT_FIX", "REJECTED"]);
    expect(moves(ticket("IN_PROGRESS"), dev)).toEqual(["FIXED", "NEED_INFO", "DUPLICATE", "WONT_FIX", "REJECTED", "NEW"]);
    expect(moves(ticket("REOPENED"), dev)).toContain("IN_PROGRESS");
  });

  it("gives other developers no moves on someone else's ticket", () => {
    expect(moves(ticket("NEW"), otherDev)).toEqual([]);
    expect(moves(ticket("NEW", null), dev)).toEqual([]);
  });

  it("lets the QA tester who filed it verify and close in one move, or reopen, but not fix", () => {
    expect(moves(ticket("FIXED"), qa)).toEqual(["CLOSED", "REOPENED"]);
    expect(allowedTransitions(ticket("FIXED"), qa)[0].label).toBe("Verify and close");
    // A ticket already Verified (before Verified stopped being a step) closes the same way; Undo verify is gone.
    expect(moves(ticket("VERIFIED"), qa)).toEqual(["CLOSED", "REOPENED"]);
    for (const s of ["CLOSED", "REJECTED", "DUPLICATE", "WONT_FIX"] as const) expect(moves(ticket(s), qa)).toEqual(["REOPENED"]);
    expect(moves(ticket("IN_PROGRESS"), qa)).toEqual(["DUPLICATE"]);
  });

  it("gives other QA testers no moves (they can't see the ticket)", () => {
    expect(moves(ticket("FIXED"), otherQa)).toEqual([]);
    expect(moves(ticket("NEED_INFO"), otherQa)).toEqual([]);
  });

  it("never lets a developer verify, close or reopen", () => {
    expect(moves(ticket("FIXED"), dev)).toEqual(["IN_PROGRESS"]); // only "Not fixed yet"
    expect(moves(ticket("VERIFIED"), dev)).toEqual([]);
    expect(moves(ticket("CLOSED"), dev)).toEqual([]);
  });

  it("lets the reporter or the developer resume a ticket waiting for info", () => {
    expect(moves(ticket("NEED_INFO"), qa)).toEqual(["IN_PROGRESS", "DUPLICATE", "CLOSED"]);
    expect(moves(ticket("NEED_INFO"), dev)).toContain("IN_PROGRESS");
  });

  it("lets the reporter withdraw a new ticket", () => {
    expect(moves(ticket("NEW"), qa)).toEqual(["DUPLICATE", "CLOSED"]);
    expect(allowedTransitions(ticket("NEW"), qa).find((m) => m.to === "CLOSED")?.label).toBe("Withdraw");
  });

  it("lets an admin do both sides", () => {
    expect(moves(ticket("NEW", "dev1"), admin)).toEqual(expect.arrayContaining(["IN_PROGRESS", "FIXED", "CLOSED"]));
    expect(moves(ticket("FIXED"), admin)).toEqual(["CLOSED", "REOPENED", "IN_PROGRESS"]);
  });

  it("offers Not a bug inside Won't fix, not as its own button, and lets the assigned developer hand a ticket back", () => {
    const wontFix = allowedTransitions(ticket("IN_PROGRESS"), dev).filter((m) => m.to === "WONT_FIX" || m.to === "REJECTED");
    expect(wontFix.map((m) => [m.to, m.label, m.within ?? null])).toEqual([
      ["WONT_FIX", "Won't fix", null],
      ["REJECTED", "Not a bug", "WONT_FIX"],
    ]);
    // Still a real move on the server, so a "Not a bug" chosen inside Won't fix is accepted.
    expect(transitionError(ticket("IN_PROGRESS"), dev, { to: "REJECTED", note: "Works as the business rule says" })).toBeNull();
    for (const s of ["NEW", "IN_PROGRESS", "REOPENED", "NEED_INFO"] as const) expect(canHandBack(ticket(s), dev)).toBe(true);
    for (const s of ["FIXED", "VERIFIED", "CLOSED", "WONT_FIX"] as const) expect(canHandBack(ticket(s), dev)).toBe(false);
    expect(canHandBack(ticket("IN_PROGRESS"), otherDev)).toBe(false);
    expect(canHandBack(ticket("IN_PROGRESS"), qa)).toBe(false);
    expect(canHandBack(ticket("IN_PROGRESS"), admin)).toBe(true);
    expect(canHandBack(ticket("IN_PROGRESS", null), admin)).toBe(false); // nobody to hand it back from
  });

  it("lets a move made by mistake be taken back a step, with a note", () => {
    const back = (s: TicketStatus, u: Actor) => allowedTransitions(ticket(s), u).filter((m) => m.back).map((m) => `${m.label} → ${m.to}`);
    expect(back("IN_PROGRESS", dev)).toEqual(["Stop work → NEW"]);
    expect(back("FIXED", dev)).toEqual(["Not fixed yet → IN_PROGRESS"]);
    expect(back("VERIFIED", qa)).toEqual([]);
    for (const s of ["REJECTED", "WONT_FIX", "DUPLICATE"] as const) expect(back(s, dev)).toEqual(["Take back → IN_PROGRESS"]);
    // Only the side that made the move (or an admin), and never once the other side has moved on.
    expect(back("IN_PROGRESS", qa)).toEqual([]);
    expect(back("VERIFIED", dev)).toEqual([]);
    expect(back("FIXED", qa)).toEqual([]);
    expect(back("CLOSED", dev)).toEqual([]);
    expect(back("IN_PROGRESS", otherDev)).toEqual([]);
    expect(back("VERIFIED", admin)).toEqual([]);
    expect(transitionError(ticket("IN_PROGRESS"), dev, { to: "NEW" })).toBe("Add a note explaining why.");
    expect(transitionError(ticket("IN_PROGRESS"), dev, { to: "NEW", note: "Started the wrong ticket" })).toBeNull();
    // A move back is never the main button, and says what to write.
    expect(allowedTransitions(ticket("FIXED"), dev)[0]).toMatchObject({ back: true, hint: expect.stringMatching(/still needs work/) });
  });

  it("returns each target status once", () => {
    for (const s of TICKET_STATUSES) {
      const list = moves(ticket(s), admin);
      expect(new Set(list).size).toBe(list.length);
    }
  });

  it("requires notes and a duplicate number where the rules say so", () => {
    expect(transitionError(ticket("IN_PROGRESS"), dev, { to: "NEED_INFO" })).toBe("Add a note explaining why.");
    expect(transitionError(ticket("IN_PROGRESS"), dev, { to: "NEED_INFO", note: "  " })).toBe("Add a note explaining why.");
    expect(transitionError(ticket("IN_PROGRESS"), dev, { to: "NEED_INFO", note: "Which account?" })).toBeNull();
    expect(transitionError(ticket("FIXED"), qa, { to: "REOPENED" })).toBe("Add a note explaining why.");
    expect(transitionError(ticket("NEW"), dev, { to: "REJECTED" })).toBe("Add a note explaining why.");
    expect(transitionError(ticket("NEW"), dev, { to: "DUPLICATE" })).toMatch(/number of the ticket/);
    expect(transitionError(ticket("NEW"), dev, { to: "DUPLICATE", duplicateOf: 3 })).toBeNull();
    expect(transitionError(ticket("IN_PROGRESS"), dev, { to: "FIXED" })).toBeNull();
  });

  it("refuses moves that aren't allowed", () => {
    expect(transitionError(ticket("NEW"), qa, { to: "FIXED" })).toMatch(/can't move this ticket from New to Fixed/);
    expect(transitionError(ticket("CLOSED"), admin, { to: "FIXED" })).toMatch(/can't move/);
  });

  it("groups statuses and gates editing and assigning", () => {
    expect(isDone("CLOSED")).toBe(true);
    expect(isDone("FIXED")).toBe(false);
    expect(OPEN_STATUSES).not.toContain("WONT_FIX");
    expect(canEditTicket(ticket("NEW"), qa)).toBe(true);
    expect(canEditTicket(ticket("NEW"), otherQa)).toBe(false);
    expect(canEditTicket(ticket("NEW"), admin)).toBe(true);
    expect(canAssign(qa)).toBe(true);
    expect(canAssign(dev)).toBe(false);
    // Per ticket: only its reporter or an admin; another tester reads it from the All tab but can't reassign it.
    expect(canAssignTicket(ticket("NEW"), qa)).toBe(true);
    expect(canAssignTicket(ticket("NEW"), otherQa)).toBe(false);
    expect(canAssignTicket(ticket("NEW"), admin)).toBe(true);
    expect(canAssignTicket(ticket("NEW"), dev)).toBe(false);
  });

  it("lets everyone who may view tickets read any of them", () => {
    for (const u of [qa, otherQa, dev, otherDev, admin]) expect(canReadTicket(u)).toBe(true);
  });

  it("scopes tickets: QA their own, developers their assignments, admins everything", () => {
    expect(ticketScope(qa)).toEqual({ reporterId: "qa1" });
    expect(ticketScope(dev)).toEqual({ assigneeId: "dev1" });
    expect(ticketScope(admin)).toBe("all");
    expect(canSeeTicket(ticket("NEW"), qa)).toBe(true);
    expect(canSeeTicket(ticket("NEW"), otherQa)).toBe(false);
    expect(canSeeTicket(ticket("NEW"), dev)).toBe(true);
    expect(canSeeTicket(ticket("NEW"), otherDev)).toBe(false);
    expect(canSeeTicket(ticket("NEW", null), dev)).toBe(false);
    expect(canSeeTicket(ticket("NEW", null), admin)).toBe(true);
  });

  it("lets only the filing QA tester or an admin edit and delete, never a developer", () => {
    const filedByDev: TicketRef = { status: "NEW", reporterId: "dev1", assigneeId: "dev1" };
    expect(canDeleteTicket(ticket("NEW"), qa)).toBe(true);
    expect(canDeleteTicket(ticket("NEW"), otherQa)).toBe(false);
    expect(canDeleteTicket(ticket("NEW"), dev)).toBe(false);
    expect(canDeleteTicket(ticket("CLOSED"), admin)).toBe(true);
    expect(canEditTicket(filedByDev, dev)).toBe(false);
    expect(canDeleteTicket(filedByDev, dev)).toBe(false);
  });
});

describe("ticket type colours", () => {
  it("gives each type its own colour", () => {
    expect(TICKET_TYPES.map((t) => TYPE_TONES[t])).toEqual(["bug", "sug", "imp"]);
    expect(new Set(Object.values(TYPE_TONES)).size).toBe(TICKET_TYPES.length);
  });
});

describe("foundInOptions", () => {
  it("offers Dev, Staging and Production", () => {
    expect(foundInOptions("")).toEqual(["Dev", "Staging", "Production"]);
    expect(foundInOptions("Staging")).toEqual(["Dev", "Staging", "Production"]);
  });

  it("keeps what an older ticket says, so editing it doesn't lose that", () => {
    expect(foundInOptions("build 2026.10.2")).toEqual(["Dev", "Staging", "Production", "build 2026.10.2"]);
  });
});

describe("canCategorize", () => {
  it("lets the assigned developer and admins change a category, and nobody else", () => {
    const t = ticket("IN_PROGRESS", "dev1");
    expect(canCategorize(t, dev)).toBe(true);
    expect(canCategorize(t, admin)).toBe(true);
    expect(canCategorize(t, otherDev)).toBe(false);
    expect(canCategorize(t, qa)).toBe(false);
  });
});
