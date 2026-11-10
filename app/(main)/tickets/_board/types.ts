import type { BoardColumnKey } from "@/lib/tickets/board";
import type { SeverityValue, TicketStatus, TicketType, Transition } from "@/lib/tickets/workflow";

/** A dropped card, shown in its new column until fresh data from the server has it there too. */
export type Pending = { from: TicketStatus; to: TicketStatus };

export type BoardCard = {
  id: string;
  number: number;
  type: TicketType;
  title: string;
  status: TicketStatus;
  severity: SeverityValue | null;
  priority: string;
  /** "Billing › Meter Reading" */
  area: string | null;
  areaId: string | null;
  comments: number;
  /** "3 h ago", worked out on the server so it matches the first paint, and the exact time for its tooltip. */
  ago: string;
  at: string;
  atLabel: string;
  /** The developer, or on a developer's own board the QA tester who filed it. */
  person: { role: string; name: string | null };
  assigneeId: string | null;
  unread: boolean;
  /** The status moves the viewer may make now (allowedTransitions). */
  moves: Transition[];
  canAssign: boolean;
};

/** `inView`: false for a column the chosen view leaves empty (Done under Open); it stays as a place to drop. */
export type BoardColumnData = {
  key: BoardColumnKey;
  total: number;
  cards: BoardCard[];
  more: string | null;
  inView: boolean;
};

export type Task =
  | {
      kind: "move";
      card: BoardCard;
      moves: Transition[];
      move: Transition | null;
      column: BoardColumnKey | null;
    }
  | { kind: "assign"; card: BoardCard };

