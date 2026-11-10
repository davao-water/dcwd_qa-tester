import { areaPath } from "@/lib/areas/tree";
import { formatDateTime, timeAgo } from "@/lib/format";
import type { TicketListRow } from "@/lib/tickets/store";
import {
  allowedTransitions,
  canAssignTicket,
  isDone,
  type Actor,
  type SeverityValue,
} from "@/lib/tickets/workflow";
import type { BoardCard } from "../board";

/** A ticket as a card on the board, with what the viewer may do to it. A developer's cards name who filed it. */
export function boardCard(
  t: TicketListRow,
  me: Actor,
  unread: boolean,
  now: Date,
  allTab: boolean,
): BoardCard {
  return {
    id: t.id,
    number: t.number,
    type: t.type,
    title: t.title,
    status: t.status,
    severity: t.severity as SeverityValue | null,
    priority: t.priority,
    area: t.area ? areaPath(t.area) : null,
    areaId: t.areaId,
    comments: t._count.comments,
    ago: timeAgo(t.lastActivityAt, now),
    at: t.lastActivityAt.toISOString(),
    atLabel: `Last activity ${formatDateTime(t.lastActivityAt)}`,
    // On the All tab a tester sees others' tickets, so their cards name who filed them; developers always see that.
    person:
      me.role === "DEV" || (allTab && t.reporter.id !== me.id)
        ? { role: "Filed by", name: t.reporter.name }
        : { role: "Developer", name: t.assignee?.name ?? null },
    assigneeId: t.assignee?.id ?? null,
    unread,
    moves: allowedTransitions(
      {
        status: t.status,
        reporterId: t.reporter.id,
        assigneeId: t.assignee?.id ?? null,
      },
      me,
    ),
    canAssign: canAssignTicket({ status: t.status, reporterId: t.reporter.id, assigneeId: t.assignee?.id ?? null }, me) && !isDone(t.status),
  };
}
