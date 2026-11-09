// The Board view of the tickets page: one column per stage of the workflow, in the order a ticket travels. Side states
// sit in their stage's column (Reopened in To do; Rejected, Duplicate and Won't fix in Done). Dropping a card on a
// column makes the move the workflow allows into it. Pure functions, unit-tested.

import type { Tone } from "@/components/status-pill";
import type { TicketGroup } from "@/lib/schemas/ticket";
import { DONE_STATUSES, OPEN_STATUSES, TICKET_STATUSES, TO_START, TO_START_STATUSES, type TicketStatus, type Transition } from "./workflow";

export type BoardColumnKey = "todo" | "doing" | "info" | "fixed" | "done";

export type BoardColumn = { key: BoardColumnKey; label: string; statuses: readonly TicketStatus[]; tone: Tone; hint: string };

export const BOARD_COLUMNS: readonly BoardColumn[] = [
  { key: "todo", label: "To do", statuses: ["NEW", "REOPENED"], tone: "info", hint: "New and reopened tickets wait here for the developer to start." },
  { key: "doing", label: "In progress", statuses: ["IN_PROGRESS"], tone: "acc", hint: "The developer is working on these." },
  { key: "info", label: "Needs info", statuses: ["NEED_INFO"], tone: "warn", hint: "The developer is waiting for an answer from QA." },
  // Verified on its own is no longer a step (QA verifies and closes in one move); tickets already Verified wait here.
  { key: "fixed", label: "Fixed", statuses: ["FIXED", "VERIFIED"], tone: "ok", hint: "Fixed and waiting for QA to retest and close." },
  { key: "done", label: "Done", statuses: DONE_STATUSES, tone: "neutral", hint: "Closed, rejected, duplicate and won't fix." },
];

/** Cards per column, the most recently active first; the list has the rest. */
export const BOARD_COLUMN_LIMIT = 50;

export const boardColumn = (key: BoardColumnKey): BoardColumn => BOARD_COLUMNS.find((c) => c.key === key)!;

export function boardColumnOf(status: TicketStatus): BoardColumnKey {
  return BOARD_COLUMNS.find((c) => c.statuses.includes(status))!.key;
}

/**
 * Whether the column can hold tickets in the chosen view, the same views as the list: Open leaves Done empty, Done
 * leaves everything else empty, Needs info only fills its column. Empty columns stay, so cards can still be dropped there.
 */
export function columnInView(key: BoardColumnKey, view: { group: TicketGroup; status: TicketStatus | typeof TO_START | null }): boolean {
  const shown: readonly TicketStatus[] = view.status === TO_START ? TO_START_STATUSES : view.status ? [view.status] : view.group === "open" ? OPEN_STATUSES : view.group === "done" ? DONE_STATUSES : TICKET_STATUSES;
  return boardColumn(key).statuses.some((s) => shown.includes(s));
}

/**
 * The moves that put a ticket in `column`, out of the ones it allows now (see allowedTransitions). Empty when it can't
 * go there. Done can take several (Close, Reject, Won't fix…), so the person picks one.
 */
export function movesInto(column: BoardColumnKey, moves: readonly Transition[]): Transition[] {
  const { statuses } = boardColumn(column);
  // Not a bug is a reason inside Won't fix, so dropping on Done offers Won't fix, which asks for it.
  return moves.filter((m) => statuses.includes(m.to) && !m.within);
}

/** Tickets opens as the list or the board: the last one picked in this browser, kept in a cookie the page reads. */
export const TICKET_VIEWS = ["list", "board"] as const;
export type TicketView = (typeof TICKET_VIEWS)[number];
export const TICKETS_VIEW_COOKIE = "qa_tickets_view";
