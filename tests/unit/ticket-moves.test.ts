import { describe, expect, it } from "vitest";
import { isRedMove, moveLayout } from "@/lib/tickets/moves";
import { allowedTransitions, type Actor, type TicketStatus } from "@/lib/tickets/workflow";

const qa: Actor = { id: "qa1", role: "QA" };
const dev: Actor = { id: "dev1", role: "DEV" };
const admin: Actor = { id: "adm", role: "ADMIN" };

/** The layout as labels, for a ticket filed by qa1 and assigned to dev1. */
function layout(status: TicketStatus, who: Actor) {
  const l = moveLayout(allowedTransitions({ status, reporterId: "qa1", assigneeId: "dev1" }, who));
  return { main: l.main?.label ?? null, second: l.second?.label ?? null, outcomes: l.outcomes.map((m) => m.label), undo: l.undo.map((m) => m.label) };
}

describe("moveLayout for the assigned developer", () => {
  it("starts work on a new or reopened ticket, with the other outcomes in More", () => {
    expect(layout("NEW", dev)).toEqual({ main: "Start work", second: null, outcomes: ["Mark fixed", "Ask for info", "Duplicate", "Won't fix"], undo: [] });
    expect(layout("REOPENED", dev).main).toBe("Start work");
  });

  it("marks fixed while working, with Stop work as an undo", () => {
    expect(layout("IN_PROGRESS", dev)).toEqual({ main: "Mark fixed", second: null, outcomes: ["Ask for info", "Duplicate", "Won't fix"], undo: ["Stop work"] });
  });

  it("resumes once info is added", () => {
    expect(layout("NEED_INFO", dev)).toEqual({ main: "Info added, resume", second: null, outcomes: ["Duplicate", "Won't fix"], undo: [] });
  });

  it("has only an undo once it's fixed or ended", () => {
    expect(layout("FIXED", dev)).toEqual({ main: null, second: null, outcomes: [], undo: ["Not fixed yet"] });
    for (const s of ["REJECTED", "WONT_FIX", "DUPLICATE"] as const) expect(layout(s, dev)).toEqual({ main: null, second: null, outcomes: [], undo: ["Take back"] });
  });
});

describe("moveLayout for the QA tester who filed it", () => {
  it("has no main move while it's the developer's turn", () => {
    expect(layout("NEW", qa)).toEqual({ main: null, second: null, outcomes: ["Duplicate", "Withdraw"], undo: [] });
    expect(layout("IN_PROGRESS", qa)).toEqual({ main: null, second: null, outcomes: ["Duplicate"], undo: [] });
  });

  it("resumes after answering, and can still withdraw", () => {
    expect(layout("NEED_INFO", qa)).toEqual({ main: "Info added, resume", second: null, outcomes: ["Duplicate", "Withdraw"], undo: [] });
  });

  it("verifies and closes a fix in one move, with Reopen beside it", () => {
    expect(layout("FIXED", qa)).toEqual({ main: "Verify and close", second: "Reopen", outcomes: [], undo: [] });
  });

  it("closes a ticket already Verified the same way, with no Undo verify", () => {
    expect(layout("VERIFIED", qa)).toEqual({ main: "Verify and close", second: "Reopen", outcomes: [], undo: [] });
  });

  it("can only reopen a finished ticket, as its one button", () => {
    for (const s of ["CLOSED", "REJECTED", "DUPLICATE", "WONT_FIX"] as const) expect(layout(s, qa)).toEqual({ main: null, second: "Reopen", outcomes: [], undo: [] });
  });
});

describe("moveLayout for an admin", () => {
  it("gets the main move of whoever's turn it is, and everything else in More", () => {
    expect(layout("NEW", admin).main).toBe("Start work");
    expect(layout("NEW", admin).outcomes).toContain("Withdraw");
    expect(layout("FIXED", admin)).toMatchObject({ main: "Verify and close", second: "Reopen", undo: ["Not fixed yet"] });
    expect(layout("REJECTED", admin)).toEqual({ main: null, second: "Reopen", outcomes: [], undo: ["Take back"] });
  });
});

describe("move colours", () => {
  it("marks Reopen and Not a bug red, keeps Not a bug out of the buttons, and never makes an undo the main move", () => {
    const moves = allowedTransitions({ status: "IN_PROGRESS", reporterId: "qa1", assigneeId: "dev1" }, dev);
    expect(moves.filter(isRedMove).map((m) => m.label)).toEqual(["Not a bug"]);
    const l = moveLayout(moves);
    expect([l.main, l.second, ...l.outcomes, ...l.undo].some((m) => m?.label === "Not a bug")).toBe(false);
    for (const s of ["IN_PROGRESS", "FIXED", "VERIFIED", "REJECTED"] as const) {
      for (const who of [dev, qa, admin]) expect(moveLayout(allowedTransitions({ status: s, reporterId: "qa1", assigneeId: "dev1" }, who)).main?.back ?? false).toBe(false);
    }
  });
});
