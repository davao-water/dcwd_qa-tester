import { MessageSquareIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { areaPath } from "@/lib/areas/tree";
import { formatDateTime, shortAgo } from "@/lib/format";
import type { TicketFilters } from "@/lib/schemas/ticket";
import type { TicketListRow } from "@/lib/tickets/store";
import { CATEGORY_LABELS, NO_CATEGORY, type SeverityValue } from "@/lib/tickets/workflow";
import { cn } from "@/lib/utils";
import { levelDot, levelName, TicketStatusPill, TicketTypeLabel, typeStyle, UnreadDot } from "../ticket-bits";
import { PeekLink } from "../ticket-peek";
import { Pager } from "./pager";

/** The 50 px table head row, as on the board: uppercase, on the table-head colour. Sticks to the top while rows scroll. */
const HEAD =
  "sticky top-0 z-1 h-[3.125rem] bg-table-head px-4 text-left align-middle text-[0.7813rem] font-semibold tracking-[0.05em] text-navy uppercase first:rounded-l-lg last:rounded-r-lg";

/** Laptops: the board's table. Big screens: the rows scroll inside the card under a sticky head, the pager stays below. */
export function TicketTable({
  rows,
  unread,
  now,
  showReporter,
  f,
  total,
  pages,
}: {
  rows: TicketListRow[];
  unread: Set<string>;
  now: Date;
  /** Whether each row names who filed it. */
  showReporter: boolean;
  f: TicketFilters;
  total: number;
  pages: number;
}) {
  return (
    <Card className="p-4 max-md:hidden desk:min-h-0 desk:flex-1">
      <div className="overflow-x-auto desk:min-h-0 desk:flex-1 desk:overflow-y-auto desk:overscroll-contain">
        <table className="w-full min-w-[47.5rem] border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th scope="col" className={cn(HEAD, "w-[4.75rem]")}>
                No.
              </th>
              <th scope="col" className={HEAD}>
                Ticket
              </th>
              <th scope="col" className={cn(HEAD, "w-32")}>
                Status
              </th>
              <th scope="col" className={cn(HEAD, "w-[9.375rem]")}>
                Developer
              </th>
              <th
                scope="col"
                className={cn(HEAD, "w-[5.75rem] text-right")}
              >
                Activity
              </th>
            </tr>
          </thead>
          <tbody className="stagger">
            {rows.map((t) => {
              const level =
                (t.severity as SeverityValue | null) ?? t.priority;
              const isUnread = unread.has(t.id);
              return (
                <tr
                  key={t.id}
                  className="relative transition-colors hover:bg-row-hover [&>td]:border-b [&>td]:border-line2 last:[&>td]:border-b-0"
                >
                  <td
                    className={cn(
                      "h-14 px-4 align-middle font-mono text-[0.8125rem] text-muted-foreground",
                      typeStyle(t.type).stripe,
                    )}
                  >
                    <span className="inline-flex items-center gap-2">
                      {t.number}
                      {isUnread ? <UnreadDot /> : null}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 align-middle">
                    <PeekLink
                      number={t.number}
                      className={cn(
                        isUnread ? "font-semibold" : "font-medium",
                        "text-[0.9063rem] after:absolute after:inset-0 hover:text-primary-text hover:underline",
                      )}
                    >
                      {t.title}
                    </PeekLink>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.8125rem] text-muted-foreground">
                      <TicketTypeLabel
                        type={t.type}
                        className="border-transparent bg-transparent px-0"
                      />
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className={cn(
                            "size-2 rounded-full",
                            levelDot(level),
                          )}
                          aria-hidden
                        />
                        {levelName(level)}
                      </span>
                      <span>
                        {t.category
                          ? CATEGORY_LABELS[t.category]
                          : NO_CATEGORY}
                      </span>
                      {t.area ? <span>{areaPath(t.area)}</span> : null}
                      {showReporter ? (
                        <span>by {t.reporter.name}</span>
                      ) : null}
                      {t._count.comments ? (
                        <span className="inline-flex items-center gap-1">
                          <MessageSquareIcon
                            className="size-3.5"
                            aria-hidden
                          />
                          <span className="font-mono">
                            {t._count.comments}
                          </span>
                          <span className="sr-only">
                            {" "}
                            repl{t._count.comments === 1 ? "y" : "ies"}
                          </span>
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 align-middle">
                    <TicketStatusPill status={t.status} />
                  </td>
                  <td
                    className={cn(
                      "max-w-[9.375rem] px-4 align-middle text-[0.875rem]",
                      !t.assignee && "text-muted-foreground",
                    )}
                  >
                    <span
                      className="block truncate"
                      title={t.assignee?.name}
                    >
                      {t.assignee?.name ?? "Not assigned"}
                    </span>
                  </td>
                  <td
                    className="px-4 text-right align-middle text-[0.8125rem] text-muted-foreground"
                    title={formatDateTime(t.lastActivityAt)}
                  >
                    {shortAgo(t.lastActivityAt, now)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pager f={f} total={total} pages={pages} />
    </Card>
  );
}
