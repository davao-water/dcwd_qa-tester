import Link from "next/link";
import { areaPath, type AreaWithParents } from "@/lib/areas/tree";
import { dayGroup, shortAgo } from "@/lib/format";
import type { TicketStatus, TicketType } from "@/lib/tickets/workflow";
import { CATEGORY_LABELS, NO_CATEGORY, type TicketCategoryValue } from "@/lib/tickets/workflow";
import { cn } from "@/lib/utils";
import { TicketStatusPill, TypeTile } from "./ticket-bits";

// Phones: tickets as rows in rounded cards instead of a table. Each row leads with the type tile, then "#128 · Billing"
// and the time, the title on up to two lines (bold while unread), the status and who has it. The whole row opens it.

export type PhoneTicket = {
  id: string;
  number: number;
  type: TicketType;
  title: string;
  status: TicketStatus;
  lastActivityAt: Date;
  area: AreaWithParents | null;
  /** Left out where a list has no category to show, such as the Dashboard for now. */
  category?: TicketCategoryValue | null;
  person: string;
};

// Hairlines between rows start after the type tile, as on a phone.
const CARD =
  "overflow-hidden rounded-2xl bg-card shadow-[0_0.0625rem_0.125rem_rgba(20,22,40,0.06),0_0.125rem_0.5rem_rgba(20,22,40,0.04)] [&>li+li]:before:absolute [&>li+li]:before:top-0 [&>li+li]:before:right-0 [&>li+li]:before:left-16 [&>li+li]:before:h-px [&>li+li]:before:bg-line2";

export function PhoneTicketRow({ t, unread, now }: { t: PhoneTicket; unread: boolean; now: Date }) {
  return (
    <li className="relative flex items-start gap-3 px-4 py-3.5 active:bg-surface3">
      <TypeTile type={t.type} />
      <div className="grid min-w-0 flex-1 gap-1">
        <div className="flex justify-between gap-2 text-[0.8125rem] text-muted-foreground">
          <span className="truncate">
            <b className="font-semibold text-ink2">#{t.number}</b>
            {t.area ? ` · ${areaPath(t.area)}` : ""}
          </span>
          <time dateTime={t.lastActivityAt.toISOString()} className={cn("shrink-0", unread && "font-semibold text-acc-ink")}>
            {shortAgo(t.lastActivityAt, now)}
          </time>
        </div>
        <Link
          href={`/tickets/${t.number}`}
          className={cn("line-clamp-2 text-base leading-snug tracking-[-0.005em] outline-none after:absolute after:inset-0 focus-visible:after:ring-3 focus-visible:after:ring-acc/30 focus-visible:after:ring-inset", unread ? "font-bold" : "font-semibold")}
        >
          {t.title}
        </Link>
        <div className="flex flex-wrap items-center gap-2 text-[0.8125rem] text-muted-foreground">
          <TicketStatusPill status={t.status} />
          <span className="truncate">{t.person}</span>
          {t.category !== undefined ? <span className="truncate">{t.category ? CATEGORY_LABELS[t.category] : NO_CATEGORY}</span> : null}
        </div>
      </div>
      {unread ? (
        <span className="mt-1.5 size-2.5 shrink-0 rounded-full bg-acc">
          <span className="sr-only">Unread</span>
        </span>
      ) : null}
    </li>
  );
}

/** One rounded card of rows. */
export function PhoneTicketList({ tickets, unread, now, className }: { tickets: PhoneTicket[]; unread: Set<string>; now: Date; className?: string }) {
  return (
    <ul className={cn(CARD, className)}>
      {tickets.map((t) => (
        <PhoneTicketRow key={t.id} t={t} unread={unread.has(t.id)} now={now} />
      ))}
    </ul>
  );
}

/** Rows grouped under Today / Yesterday / Earlier, for a list sorted newest activity first. */
export function PhoneTicketGroups({ tickets, unread, now }: { tickets: PhoneTicket[]; unread: Set<string>; now: Date }) {
  const groups = new Map<string, PhoneTicket[]>();
  for (const t of tickets) {
    const g = dayGroup(t.lastActivityAt, now);
    groups.set(g, [...(groups.get(g) ?? []), t]);
  }
  return (
    <div className="grid gap-5 md:hidden">
      {[...groups].map(([label, rows]) => (
        <section key={label} className="grid gap-2" aria-label={label}>
          <h2 className="px-1 text-[0.8125rem] font-semibold tracking-[0.04em] text-muted-foreground uppercase">{label}</h2>
          <PhoneTicketList tickets={rows} unread={unread} now={now} />
        </section>
      ))}
    </div>
  );
}
