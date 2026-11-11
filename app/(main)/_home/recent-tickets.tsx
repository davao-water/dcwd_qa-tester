import Link from "next/link";
import { Card } from "@/components/ui/card";
import { shortAgo } from "@/lib/format";
import type { TicketStore } from "@/lib/tickets/store";
import { cn } from "@/lib/utils";
import { levelDot, levelName, TicketStatusPill, UnreadDot } from "../tickets/ticket-bits";
import { PhoneTicketList } from "../tickets/ticket-card";
import { CardHead } from "./card-head";

type Recent = Awaited<ReturnType<TicketStore["recent"]>>[number];

/** The dashboard's ticket list: rows on laptops, the phone cards on phones. */
export function RecentTickets({
  rows,
  unread,
  title,
  tip,
  person,
  empty,
  canFile = false,
  byFiled = false,
}: {
  /** Sorted by when they were filed, so the age column shows that too. */
  byFiled?: boolean;
  rows: Recent[];
  unread: Set<string>;
  title: string;
  tip: string;
  person: (t: Recent) => string;
  empty: string;
  canFile?: boolean;
}) {
  const now = new Date();
  const emptyText = (
    <>
      {empty}{" "}
      {canFile ? <Link href="/tickets/new" className="font-medium text-primary-text hover:underline">New ticket</Link> : null}
    </>
  );
  return (
    <>
      {/* Phones: a section heading over a rounded card of ticket rows. */}
      <section className="grid gap-2 md:hidden" aria-label={title}>
        <div className="flex items-baseline justify-between px-1">
          <h2 className="text-[0.8125rem] font-semibold tracking-[0.04em] text-muted-foreground uppercase">{title}</h2>
          <Link href="/tickets?group=all" className="text-sm font-medium text-acc-ink">See all</Link>
        </div>
        {rows.length ? (
          <PhoneTicketList tickets={rows.map((t) => ({ ...t, person: person(t) }))} unread={unread} now={now} />
        ) : (
          <p className="rounded-2xl bg-card px-4 py-5 text-sm text-muted-foreground">{emptyText}</p>
        )}
      </section>
      <Card role="region" aria-labelledby="list-title" className="@container/list max-md:hidden">
        <CardHead id="list-title" title={title} tip={tip} link={{ href: "/tickets?group=all", label: "View all" }} />
        {rows.length === 0 ? (
          <p className="border-t border-line2 px-5 py-4 text-sm text-muted-foreground">{emptyText}</p>
        ) : (
          <ul className="stagger pb-2">
            {rows.map((t) => {
              const level = t.severity ?? t.priority;
              const isUnread = unread.has(t.id);
              return (
                <li key={t.id} className="relative flex min-h-13 items-center gap-3 border-t border-line2 px-5 py-1.5 text-sm hover:bg-row-hover">
                  <span className="flex w-[4.5rem] shrink-0 items-center gap-1.5 font-mono text-[0.8438rem] text-muted-foreground">
                    #{t.number}
                    {isUnread ? <UnreadDot /> : null}
                  </span>
                  <span className={cn("size-2.5 shrink-0 rounded-full", levelDot(level))} title={levelName(level)}>
                    <span className="sr-only">{levelName(level)}</span>
                  </span>
                  <Link
                    href={`/tickets/${t.number}`}
                    title={t.title}
                    className={cn("min-w-0 flex-1 truncate after:absolute after:inset-0 hover:text-primary-text hover:underline", isUnread ? "font-semibold" : "font-medium")}
                  >
                    {t.title}
                  </Link>
                  {/* Hidden when the card itself is narrow (a small window, or the notifications panel open). */}
                  <span className="w-32 shrink-0 truncate text-[0.8125rem] text-muted-foreground @max-[38rem]/list:hidden">{person(t)}</span>
                  <span className="w-[6.5rem] shrink-0"><TicketStatusPill status={t.status} /></span>
                  <span className="w-12 shrink-0 text-right text-[0.8125rem] text-muted-foreground">{shortAgo(byFiled ? t.createdAt : t.lastActivityAt, now)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
