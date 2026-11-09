import type { TicketStatus, Transition } from "./workflow";

// How a ticket's moves are laid out in its title row, so each person sees their one obvious next step: the main button,
// at most one equally common second button, and everything else in a "More" menu (other outcomes, then undo a mistake).
// The workflow decides which moves exist (allowedTransitions); this only arranges them. Pure, unit-tested.

/** Moves that carry the ticket forward along the main path. The first one the person may make is their main button. */
const FORWARD: readonly TicketStatus[] = ["IN_PROGRESS", "FIXED"];

/** Moves that send a ticket back or end it against the reporter's wish, so they read as a warning (red). */
const RED: readonly TicketStatus[] = ["REOPENED", "REJECTED"];

export const isRedMove = (m: Transition) => RED.includes(m.to);

// Verify and close is QA's step forward; Withdraw also ends in Closed but is the reporter calling it off.
const isForward = (m: Transition) => !m.back && (FORWARD.includes(m.to) || (m.to === "CLOSED" && m.label === "Verify and close"));

export type MoveLayout = {
  /** This person's next step, or null when it isn't their turn. */
  main: Transition | null;
  /** A second choice as common as the main one: Reopen while retesting a fix, or on a finished ticket. */
  second: Transition | null;
  /** The rest of the ways a ticket can end or change: Ask for info, Duplicate, Won't fix, Reject, Withdraw… */
  outcomes: Transition[];
  /** Moves back a step, to correct a mistake: Stop work, Not fixed yet, Undo verify, Take back. */
  undo: Transition[];
};

export function moveLayout(all: Transition[]): MoveLayout {
  // A reason chosen inside another move's dialog (Not a bug, inside Won't fix) isn't a button of its own.
  const moves = all.filter((m) => !m.within);
  const main = moves.find(isForward) ?? null;
  const reopen = moves.find((m) => m.to === "REOPENED") ?? null;
  // Retesting a fix (the main move is verify and close) or a finished ticket (nothing else to do): Reopen sits beside.
  const second = reopen && (main?.to === "CLOSED" || !main) ? reopen : null;
  const rest = moves.filter((m) => m !== main && m !== second);
  return { main, second, outcomes: rest.filter((m) => !m.back), undo: rest.filter((m) => m.back) };
}
