import { describe, expect, it } from "vitest";
import { nextStep, ticketFlow, type FlowInput } from "@/lib/tickets/flow";
import type { TicketStatus } from "@/lib/tickets/workflow";

const at = (min: number) => new Date(Date.UTC(2026, 9, 29, 1, min));
const move = (from: TicketStatus, to: TicketStatus, min: number) => ({ kind: "STATUS", from, to, createdAt: at(min) });

const base = (status: TicketStatus, events: FlowInput["events"] = [], over: Partial<FlowInput> = {}): FlowInput => ({
  status,
  createdAt: at(0),
  closedAt: null,
  events,
  reporter: { name: "Ana" },
  assignee: { name: "Ben" },
  ...over,
});

const shape = (input: FlowInput) => ticketFlow(input).steps.map((s) => `${s.label}:${s.state}`);

describe("nextStep", () => {
  const qa = { isReporter: true, isAssignee: false };
  const dev = { isReporter: false, isAssignee: true };
  const other = { isReporter: false, isAssignee: false };

  it("uses the board's wording for a fix to retest", () => {
    expect(nextStep(base("FIXED"), qa)).toEqual({ title: "Your move: retest this fix", text: "Ben marked this as fixed. Check it in the ERP, then verify and close it, or reopen it." });
    expect(nextStep(base("FIXED"), dev)).toEqual({ title: "Ana’s move", text: "Waiting on Ana (QA) to retest the fix, then verify and close it." });
  });

  it("says a verified ticket can be closed, to everyone", () => {
    for (const viewer of [qa, dev, other]) expect(nextStep(base("VERIFIED"), viewer).title).toBe("Verified, ready to close");
  });

  it("says who reopened it only to the person who could have", () => {
    expect(nextStep(base("REOPENED"), qa)).toEqual({ title: "Ben’s move", text: "You reopened this ticket. It returns to the developer." });
    expect(nextStep(base("REOPENED"), other).text).toBe("This ticket was reopened. It returns to the developer.");
    expect(nextStep(base("REOPENED"), dev)).toEqual({ title: "Your move", text: "Start work." });
  });

  it("covers the other open statuses, for whoever is reading", () => {
    expect(nextStep(base("NEW"), dev)).toEqual({ title: "Your move", text: "Start work." });
    expect(nextStep(base("NEW", [], { assignee: null }), qa)).toEqual({ title: "Your move", text: "Pick a developer." });
    expect(nextStep(base("IN_PROGRESS"), qa)).toEqual({ title: "Ben’s move", text: "Waiting on Ben (developer) to fix it and mark it fixed." });
    expect(nextStep(base("IN_PROGRESS", [], { assignee: null }), qa)).toEqual({ title: "The developer’s move", text: "Waiting on the developer (developer) to fix it and mark it fixed." });
    expect(nextStep(base("NEED_INFO"), qa)).toEqual({ title: "Your move", text: "Answer the developer's question." });
  });

  it("is finished once the ticket has ended", () => {
    for (const s of ["CLOSED", "REJECTED", "DUPLICATE", "WONT_FIX"] as const) expect(nextStep(base(s), qa).title).toBe("Finished");
  });
});

describe("ticketFlow", () => {
  it("starts on Filed, waiting for the developer", () => {
    const f = ticketFlow(base("NEW"));
    expect(shape(base("NEW"))).toEqual(["Filed:current", "In progress:upcoming", "Fixed:upcoming", "Closed:upcoming"]);
    expect(f.steps[0].at).toEqual(at(0));
    expect(f.next).toEqual({ who: "Ben", side: "developer", action: "start work" });
    expect(ticketFlow(base("NEW", [], { assignee: null })).next).toEqual({ who: "Ana", side: "qa", action: "pick a developer" });
  });

  it("follows the main path with the time each step was reached", () => {
    const events = [move("NEW", "IN_PROGRESS", 5), move("IN_PROGRESS", "FIXED", 30)];
    const f = ticketFlow(base("FIXED", events));
    expect(f.steps.map((s) => s.state)).toEqual(["done", "done", "current", "upcoming"]);
    expect(f.steps.map((s) => s.at)).toEqual([at(0), at(5), at(30), null]);
    expect(f.next).toEqual({ who: "Ana", side: "qa", action: "retest the fix, then verify and close it" });
    // A ticket Verified before that stopped being a step sits on the Fixed step, waiting to be closed.
    const verified = ticketFlow(base("VERIFIED", [...events, move("FIXED", "VERIFIED", 40)]));
    expect(verified.steps[2]).toMatchObject({ label: "Verified", state: "current", tone: "ok", at: at(40) });
    expect(verified.next?.action).toBe("close the ticket");
  });

  it("shows Needs info and Reopened on the In progress step", () => {
    const needInfo = ticketFlow(base("NEED_INFO", [move("NEW", "NEED_INFO", 3)]));
    expect(needInfo.steps[1]).toMatchObject({ label: "Needs info", state: "current", tone: "warn", at: at(3) });
    expect(needInfo.next).toMatchObject({ who: "Ana", side: "qa" });

    const reopened = ticketFlow(base("REOPENED", [move("NEW", "IN_PROGRESS", 1), move("IN_PROGRESS", "FIXED", 2), move("FIXED", "REOPENED", 9)]));
    expect(reopened.steps.map((s) => `${s.label}:${s.state}`)).toEqual(["Filed:done", "Reopened:current", "Fixed:upcoming", "Closed:upcoming"]);
    expect(reopened.steps[1].tone).toBe("bad");
    expect(reopened.next?.action).toBe("start work");
  });

  it("completes every step when closed", () => {
    const f = ticketFlow(base("CLOSED", [move("NEW", "IN_PROGRESS", 1), move("IN_PROGRESS", "FIXED", 2), move("FIXED", "CLOSED", 4)], { closedAt: at(4) }));
    expect(f.steps.every((s) => s.state === "done")).toBe(true);
    expect(f.steps[3]).toMatchObject({ tone: "ok", at: at(4) });
    expect(f.next).toBeNull();
  });

  it("ends early on Rejected, Duplicate or Won't fix and skips the steps in between", () => {
    const f = ticketFlow(base("REJECTED", [move("NEW", "IN_PROGRESS", 1), move("IN_PROGRESS", "REJECTED", 6)], { closedAt: at(6) }));
    expect(f.steps.map((s) => `${s.label}:${s.state}`)).toEqual(["Filed:done", "In progress:done", "Fixed:skipped", "Rejected:done"]);
    expect(f.steps[3]).toMatchObject({ tone: "neutral", at: at(6) });
    expect(f.next).toBeNull();
    expect(shape(base("DUPLICATE", [move("NEW", "DUPLICATE", 2)], { closedAt: at(2) }))).toEqual([
      "Filed:done",
      "In progress:skipped",
      "Fixed:skipped",
      "Duplicate:done",
    ]);
  });
});
