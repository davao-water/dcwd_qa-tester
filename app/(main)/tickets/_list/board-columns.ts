import { columnInView, type BoardColumnKey } from "@/lib/tickets/board";
import type { TicketFilters } from "@/lib/schemas/ticket";
import type { TicketListRow } from "@/lib/tickets/store";
import type { Actor } from "@/lib/tickets/workflow";
import { boardCard } from "./board-card";
import { hrefWith } from "./href";

/** Where a full column's "See all in the list" goes: that stage in the list. */
const MORE: Record<BoardColumnKey, { group: string; status: string | null }> = {
  todo: { group: "open", status: null },
  doing: { group: "open", status: "IN_PROGRESS" },
  info: { group: "open", status: "NEED_INFO" },
  fixed: { group: "open", status: "FIXED" },
  done: { group: "done", status: null },
};

/** The board's columns: each stage's cards, and a link to the rest when a column is full. */
export function boardColumns(
  board: { key: BoardColumnKey; total: number; rows: TicketListRow[] }[],
  f: TicketFilters,
  me: Actor,
  unread: Set<string>,
  now: Date,
  allTab: boolean,
) {
  return board.map((c) => ({
    key: c.key,
    total: c.total,
    cards: c.rows.map((t) => boardCard(t, me, unread.has(t.id), now, allTab)),
    more:
      c.total > c.rows.length
        ? hrefWith(f, { view: "list", ...MORE[c.key] })
        : null,
    inView: columnInView(c.key, f),
  }));
}
