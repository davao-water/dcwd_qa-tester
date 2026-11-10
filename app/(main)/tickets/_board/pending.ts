import { boardColumnOf } from "@/lib/tickets/board";
import type { BoardCard, BoardColumnData, Pending } from "./types";

export const without = <T,>(map: Record<string, T>, id: string) => {
  const next = { ...map };
  delete next[id];
  return next;
};

/** Keeps the drops the server doesn't show yet: the card is still there with its old status. */
export function stillPending(
  pending: Record<string, Pending>,
  columns: BoardColumnData[],
) {
  const status = new Map(
    columns.flatMap((c) =>
      c.cards.map((card) => [card.id, card.status] as const),
    ),
  );
  return Object.fromEntries(
    Object.entries(pending).filter(([id, p]) => status.get(id) === p.from),
  );
}

/** The board with dropped cards already in their new columns, at the top, until the server has them there. */
export function withPending(
  columns: BoardColumnData[],
  pending: Record<string, Pending>,
): BoardColumnData[] {
  const moved: BoardCard[] = [];
  const out = columns.map((c) => {
    const cards = c.cards.filter((card) => {
      const p = pending[card.id];
      if (!p || card.status !== p.from) return true;
      // Nothing to do with it until it's saved.
      moved.push({
        ...card,
        status: p.to,
        ago: "just now",
        unread: false,
        moves: [],
        canAssign: false,
      });
      return false;
    });
    return { ...c, cards, total: c.total - (c.cards.length - cards.length) };
  });
  for (const card of moved) {
    const c = out.find((x) => x.key === boardColumnOf(card.status))!;
    c.cards = [card, ...c.cards];
    c.total += 1;
  }
  return out;
}
