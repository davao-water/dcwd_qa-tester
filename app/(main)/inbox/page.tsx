import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { ArrowLeftIcon, ArrowRightIcon, MessagesSquareIcon, SearchIcon } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { InboxSkeleton } from "@/components/skeletons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { areaPath } from "@/lib/areas/tree";
import { requireAction } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { shortAgo, timeAgo } from "@/lib/format";
import { INBOX_PAGE, inboxStore, type InboxThread } from "@/lib/tickets/inbox";
import { ticketStore } from "@/lib/tickets/store";
import type { SeverityValue } from "@/lib/tickets/workflow";
import { cn } from "@/lib/utils";
import { Message, Thread, galleryImages } from "@/components/conversation/conversation";
import { ImageGallery } from "@/components/conversation/image-viewer";
import { MarkRead } from "@/components/conversation/mark-read";
import { CommentForm } from "@/components/conversation/comment-form";
import { SeverityTag, TicketStatusPill, TicketTypeLabel, UnreadDot } from "@/components/ticket-badges";
import { ScrollToLatest } from "@/components/scroll-to-latest";

// My inbox: the conversations on the tickets this person can see, Messenger-style. The list is on the left, the
// selected conversation (?t=<number>) on the right with a reply box. On a phone, one of the two at a time.
// Status changes, editing and assigning stay on the ticket page ("Open ticket").

export const metadata: Metadata = { title: "My inbox" };

const tickets = ticketStore(db);
const inbox = inboxStore(db);

type Params = { t: number | null; q: string; unread: boolean; n: number };

function parse(sp: Record<string, string | string[] | undefined>): Params {
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const t = /^\d{1,9}$/.test(one("t")) ? Number(one("t")) : null;
  const n = /^\d{1,4}$/.test(one("n")) ? Math.min(Number(one("n")), 400) : INBOX_PAGE;
  return { t, q: one("q").slice(0, 100), unread: one("unread") === "1", n };
}

/** An /inbox URL with some parameters changed. */
function hrefWith(p: Params, patch: Partial<Params>): string {
  const m = { ...p, ...patch };
  const qs = new URLSearchParams();
  if (m.q) qs.set("q", m.q);
  if (m.unread) qs.set("unread", "1");
  if (m.n !== INBOX_PAGE) qs.set("n", String(m.n));
  if (m.t) qs.set("t", String(m.t));
  const s = qs.toString();
  return s ? `/inbox?${s}` : "/inbox";
}

export default function InboxPage({ searchParams }: PageProps<"/inbox">) {
  return (
    // Big screens (D21): the page fits the window; the conversation list and the messages scroll inside the card.
    <div className="grid gap-6 desk:flex desk:h-[calc(100dvh-12.5rem)] desk:min-h-112 desk:flex-col">
      <PageHeader title="My inbox" description="The conversations on your tickets, newest first. Replies you send here go to the ticket." />
      <Suspense fallback={<InboxSkeleton />}>
        <Inbox searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Inbox({ searchParams }: { searchParams: PageProps<"/inbox">["searchParams"] }) {
  const sp = await searchParams;
  await connection();
  const me = await requireAction("tickets.view");
  const p = parse(sp);

  const [{ threads, more }, t, unreadCount] = await Promise.all([
    inbox.threads(me, { q: p.q, unreadOnly: p.unread, take: p.n }),
    p.t ? tickets.get(p.t, me) : null,
    inbox.unreadCount(me),
  ]);
  // Someone else's ticket is a 404, as on the ticket page.
  if (p.t && !t) notFound();
  const now = new Date();

  return (
    <div
      className="grid grid-cols-1 overflow-hidden rounded-[0.875rem] border border-line bg-card shadow-(--shadow-card) max-md:rounded-2xl max-md:border-transparent lg:h-[calc(100dvh-17.5rem)] lg:min-h-[32.5rem] lg:grid-cols-[minmax(18.75rem,23.75rem)_minmax(0,1fr)] desk:h-auto! desk:min-h-0 desk:flex-1"
    >
      {/* Conversations */}
      <section aria-label="Conversations" className={cn("min-h-0 flex-col border-line lg:flex lg:border-r", t ? "hidden" : "flex")}>
        <div className="grid gap-2.5 border-b border-line2 px-4 py-3.5">
          {/* Enter searches; there's no button, as on the board. */}
          <form action="/inbox" role="search" className="relative">
            {p.unread ? <input type="hidden" name="unread" value="1" /> : null}
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input type="search" name="q" defaultValue={p.q} enterKeyHint="search" placeholder="Search title or #number" aria-label="Search conversations" className="h-10 pl-9 text-sm" />
          </form>
          {/* All or Unread: the design system's segmented control, still as links. */}
          <nav aria-label="Conversation views" className="grid grid-cols-2 gap-0.5 rounded-[0.625rem] bg-surface3 p-[0.1875rem]">
            {[
              { label: "All", on: !p.unread, href: hrefWith(p, { unread: false, t: null }), count: null },
              { label: "Unread", on: p.unread, href: hrefWith(p, { unread: true, t: null }), count: unreadCount },
            ].map((v) => (
              <Link
                key={v.label}
                href={v.href}
                aria-current={v.on ? "page" : undefined}
                className={cn(
                  "flex h-[1.875rem] items-center justify-center gap-1.5 rounded-[0.4375rem] text-[0.8438rem] font-medium outline-none transition-[background-color,color,box-shadow] focus-visible:ring-3 focus-visible:ring-acc/30",
                  v.on ? "bg-card text-foreground shadow-(--shadow-card)" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {v.label}
                {v.count !== null ? (
                  <span className="font-mono text-[0.75rem] tabular-nums">
                    {v.count > 99 ? "99+" : v.count}
                    <span className="sr-only"> unread</span>
                  </span>
                ) : null}
              </Link>
            ))}
          </nav>
        </div>
        {threads.length ? (
          <ul className="stagger min-h-0 flex-1 overflow-y-auto">
            {threads.map((x) => (
              <ThreadRow key={x.id} x={x} href={hrefWith(p, { t: x.number })} active={x.number === t?.number} now={now} />
            ))}
            {more ? (
              <li className="border-t border-line2 p-3 text-center">
                <Link href={hrefWith(p, { n: p.n + INBOX_PAGE })} className="text-sm font-medium text-primary-text hover:underline">
                  Show more
                </Link>
              </li>
            ) : null}
          </ul>
        ) : (
          <p className="p-6 text-center text-sm text-muted-foreground">
            {p.q || p.unread ? "Nothing matches. Try All, or clear the search." : me.role === "DEV" ? "Conversations appear here when a ticket is assigned to you." : "No conversations yet."}
          </p>
        )}
      </section>

      {/* The selected conversation */}
      {t ? (
        <section aria-label={`Conversation on #${t.number}`} className="flex min-h-0 flex-col">
          <MarkRead ticketId={t.id} number={t.number} lastActivityAt={t.lastActivityAt.toISOString()} />
          <ScrollToLatest targetId="inbox-messages" endId="inbox-reply" version={t.lastActivityAt.toISOString()} />
          {/* As on the board: the ticket on one line, module and developer under it, then its status and Open ticket. */}
          <header className="grid grid-cols-1 gap-y-1.5 border-b border-line2 px-5 py-3.5">
            <Link href={hrefWith(p, { t: null })} className="inline-flex items-center gap-1.5 text-[0.8438rem] text-muted-foreground hover:text-primary-text lg:hidden">
              <ArrowLeftIcon className="size-3.5" aria-hidden /> My inbox
            </Link>
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 xl:flex-nowrap">
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold" title={t.title}>
                  <span className="mr-1.5 font-mono font-medium text-muted-foreground">#{t.number}</span>
                  {t.title}
                </h2>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[0.8125rem] text-muted-foreground">
                  <span>{t.area ? areaPath(t.area) : "Module not set"}</span>
                  <span aria-hidden>·</span>
                  <span>{t.assignee ? `Developer: ${t.assignee.name}` : "Not assigned"}</span>
                  <span aria-hidden>·</span>
                  <span>Filed by {t.reporter.name}</span>
                  <span aria-hidden>·</span>
                  <TicketTypeLabel type={t.type} className="border-transparent bg-transparent px-0" />
                  <SeverityTag severity={t.severity as SeverityValue | null} priority={t.priority} />
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <TicketStatusPill status={t.status} />
                <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/tickets/${t.number}?tab=conversation`} />}>
                  Open ticket <ArrowRightIcon />
                </Button>
              </div>
            </div>
          </header>
          <ImageGallery images={galleryImages(t)}>
            <div id="inbox-messages" className="grid min-h-0 flex-1 grid-cols-1 content-start gap-3.5 overflow-y-auto overscroll-contain bg-surface2 p-5">
              {/* The ticket's own description and files come first, as the first message. */}
              {t.description || t.attachments.length ? <Message author={t.reporter} mine={t.reporter.id === me.id} at={t.createdAt} now={now} body={t.description} files={t.attachments} /> : null}
              <Thread t={t} meId={me.id} now={now} />
            </div>
          </ImageGallery>
          <div id="inbox-reply" className="max-h-[60%] shrink-0 overflow-y-auto border-t border-line2 px-5 py-3.5">
            <CommentForm ticket={{ id: t.id, number: t.number }} />
          </div>
        </section>
      ) : (
        <div className="hidden flex-col items-center justify-center gap-2.5 p-10 text-center lg:flex">
          <span className="flex size-12 items-center justify-center rounded-full bg-acc-t text-primary-text" aria-hidden>
            <MessagesSquareIcon className="size-6" />
          </span>
          <p className="text-[0.9375rem] font-semibold">Pick a conversation</p>
          <p className="max-w-xs text-sm text-muted-foreground">Choose a ticket on the left to read its messages and reply.</p>
        </div>
      )}
    </div>
  );
}

/** A conversation in the list, in three lines as on the board: number and age, the title, then the last thing said. */
function ThreadRow({ x, href, active, now }: { x: InboxThread; href: string; active: boolean; now: Date }) {
  return (
    <li className="border-b border-line2 last:border-b-0">
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn("grid grid-cols-1 gap-0.5 px-4 py-3 transition-colors hover:bg-row-hover", active && "bg-acc-t2 hover:bg-acc-t2")}
      >
        <span className="flex items-center gap-2 text-[0.8125rem]">
          <span className={cn("font-mono", x.unread ? "text-foreground" : "text-muted-foreground")}>#{x.number}</span>
          {x.unread ? <UnreadDot /> : null}
          <span className="flex-1" />
          <time dateTime={x.lastActivityAt.toISOString()} title={timeAgo(x.lastActivityAt, now)} className={cn("shrink-0 text-[0.7813rem]", x.unread ? "font-semibold text-foreground" : "text-muted-foreground")}>
            {shortAgo(x.lastActivityAt, now)}
          </time>
        </span>
        <span className={cn("truncate text-[0.9063rem]", x.unread ? "font-semibold" : "font-medium")} title={x.title}>
          {x.title}
        </span>
        <span className="flex items-center gap-2">
          <span className={cn("min-w-0 flex-1 truncate text-[0.8438rem]", x.unread ? "text-foreground" : "text-muted-foreground")}>{x.preview}</span>
          {x.unreadMessages ? (
            <span className="flex h-5 shrink-0 items-center rounded-full bg-bad-t px-[0.4375rem] text-[0.75rem] leading-none font-semibold text-destructive-text">
              {x.unreadMessages > 99 ? "99+" : x.unreadMessages} new
              <span className="sr-only"> {x.unreadMessages === 1 ? "message" : "messages"}</span>
            </span>
          ) : null}
        </span>
      </Link>
    </li>
  );
}
