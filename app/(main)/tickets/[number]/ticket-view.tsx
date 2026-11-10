import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { TicketXIcon } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { InfoTip } from "@/components/info-tip";
import { ScrollToLatest } from "@/components/scroll-to-latest";
import { ImageGallery } from "./image-viewer";
import { DraftCleanup } from "./draft-cleanup";
import { MarkRead } from "./mark-read";
import { Evidence, galleryImages, Thread } from "./conversation";
import { Card } from "@/components/ui/card";
import { areaPath } from "@/lib/areas/tree";
import { requireAction } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatDate, formatDateTime } from "@/lib/format";
import { nextStep, ticketFlow } from "@/lib/tickets/flow";
import { buildActivityLog, type LogEntry } from "@/lib/tickets/log";
import { TICKET_TITLE_ID } from "@/lib/tickets/peek";
import { ticketStore } from "@/lib/tickets/store";
import {
  allowedTransitions,
  canAssignTicket,
  canHandBack,
  canCategorize,
  CATEGORY_LABELS,
  NO_CATEGORY,
  canDeleteTicket,
  canEditTicket,
  DEVICE_LABELS,
  isDone,
  type DeviceType,
  type SeverityValue,
} from "@/lib/tickets/workflow";
import { cn } from "@/lib/utils";
import { ticketFormOptions } from "../options";
import { LevelLabel, TicketStatusPill, TicketTypeLabel } from "../ticket-bits";
import { AssignControl } from "./_controls/assign-control";
import { CategoryControl } from "./_controls/category-control";
import { CommentForm } from "./_controls/comment-form";
import { TicketMoreMenu } from "./_controls/more-menu";
import { StatusMoves } from "./_controls/status-moves";
import { TicketFlow } from "./ticket-flow";
import { TicketPane, TicketTabs } from "./ticket-tabs";

// One ticket: details, conversation and history. Shown as its own page (/tickets/N) and in the panel that opens over the
// board or the list (/tickets/N/peek, see ../ticket-peek.tsx). Both read the session here, inside their Suspense boundary.

const tickets = ticketStore(db);

export async function TicketView({ params, mode }: { params: Promise<{ number: string }>; mode: "page" | "peek" }) {
  const { number: raw } = await params;
  await connection();
  const me = await requireAction("tickets.view");
  const number = /^\d{1,9}$/.test(raw) ? Number(raw) : NaN;
  // Anyone may read any ticket (the All tab); the buttons below only show what this person may change. A missing ticket
  // is a 404; in the panel, a short note says so instead.
  const t = Number.isFinite(number) ? await tickets.get(number, me) : null;
  if (!t) {
    if (mode === "page") notFound();
    return (
      <EmptyState icon={TicketXIcon} title="Ticket not found">
        It may have been deleted.
      </EmptyState>
    );
  }

  const ref = { id: t.id, number: t.number };
  const moves = allowedTransitions(t, me);
  const editable = canEditTicket(t, me);
  const deletable = canDeleteTicket(t, me);
  const log = buildActivityLog(t);
  const assignable = canAssignTicket(t, me) && !isDone(t.status);
  // Won't fix can hand the ticket back to QA with a recommended developer, so that person needs the list too.
  const handsBack = canHandBack(t, me);
  const options = editable || assignable || handsBack ? await ticketFormOptions() : null;
  const now = new Date();

  const header = (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-[1_1_32.5rem]">
          <h1 id={TICKET_TITLE_ID} className="text-[1.5rem] leading-[1.2] font-semibold tracking-[-0.015em] wrap-anywhere md:text-[1.75rem]">
            <span className="mr-2 font-mono font-medium text-muted-foreground">
              #{t.number}
            </span>
            {t.title}
          </h1>
          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-muted-foreground">
            <TicketStatusPill status={t.status} />
            <TicketTypeLabel
              type={t.type}
              className="md:border-transparent md:bg-transparent md:px-0 md:text-sm"
            />
            <LevelLabel
              value={(t.severity as SeverityValue | null) ?? t.priority}
            />
            <span>
              Filed by {t.reporter.name},{" "}
              <time
                dateTime={t.createdAt.toISOString()}
                title={formatDateTime(t.createdAt)}
              >
                {formatDate(t.createdAt)}
              </time>
            </span>
            {t.duplicateOf ? (
              <Link
                href={`/tickets/${t.duplicateOf.number}`}
                className="font-medium text-primary-text hover:underline"
              >
                Duplicate of #{t.duplicateOf.number}
              </Link>
            ) : null}
          </div>
        </div>
        {/* The moves this person can make, then Edit and Delete behind ⋯ More (D21). */}
        <div className="flex flex-wrap items-center gap-2">
          <StatusMoves
            ticket={ref}
            status={t.status}
            moves={moves}
            handBack={handsBack && options ? { developers: options.people.filter((p) => p.id !== t.assigneeId).map((p) => ({ id: p.id, name: p.name })) } : null}
          />
          <TicketMoreMenu
            edit={
              editable && options
                ? {
                    areas: options.areas,
                    people: options.people,
                    ticket: {
                      id: t.id,
                      number: t.number,
                      type: t.type,
                      title: t.title,
                      description: t.description,
                      areaId: t.areaId,
                      severity: t.severity as SeverityValue | null,
                      priority: t.priority,
                      foundIn: t.foundIn,
                      deviceType: t.deviceType as DeviceType | null,
                    },
                  }
                : null
            }
            del={
              deletable
                ? {
                    ticket: { id: t.id, number: t.number, title: t.title },
                    replies: t.comments.length,
                    files:
                      t.attachments.length +
                      t.comments.reduce((n, c) => n + c.attachments.length, 0),
                  }
                : null
            }
          />
        </div>
      </div>

      {/* Whose move it is shows when a step is hovered (laptops), or as a line under the steps (phones). */}
      <TicketFlow
        flow={ticketFlow(t)}
        next={nextStep(t, {
          isReporter: t.reporterId === me.id,
          isAssignee: t.assigneeId === me.id,
        })}
        now={now}
      />
    </>
  );

  // The other side of the conversation, for the reply box's placeholder.
  const replyTo = t.reporterId === me.id ? t.assignee?.name : t.reporter.name;

  return (
    <>
      <MarkRead
        ticketId={t.id}
        number={t.number}
        lastActivityAt={t.lastActivityAt.toISOString()}
      />
      <DraftCleanup userId={me.id} />
      <TicketTabs replies={t.comments.length} header={header}>
        {/* Main and side columns; the side column drops under when they no longer fit. On Conversation it's hidden, so the main one takes the width. */}
        {/* Big screens (D21): both columns fill the panel's height, and each card scrolls inside itself. */}
        <div className="flex flex-wrap items-start gap-6 desk:h-full desk:flex-nowrap desk:items-stretch">
          <div className="min-w-0 flex-[999_1_35rem] desk:flex desk:flex-col">
            <ImageGallery images={galleryImages(t)}>
              <div className="grid min-w-0 grid-cols-1 content-start gap-6 desk:flex desk:min-h-0 desk:flex-1 desk:flex-col">
                <TicketPane tab="details">
                  {/* One card holds the ticket's Details and its Report, one after the other. On big screens it fills the
                    column and scrolls as one (D21), so the Report never sits in a half-empty box of its own. */}
                  <Card className="desk:min-h-0 desk:flex-1 desk:overflow-y-auto desk:overscroll-contain">
                    <section aria-labelledby="details-title">
                      <h2
                        id="details-title"
                        className="px-5 pt-5 text-lg font-semibold"
                      >
                        Details
                      </h2>
                      {/* A spec sheet: fields grouped under small headings, in columns that share the card's width. No boxes
                        inside the card. Status isn't repeated here; it is in the title row. */}
                      <div className="grid gap-x-10 gap-y-6 px-5 pt-4 pb-5 sm:grid-cols-2 lg:grid-cols-3">
                        <DetailGroup title="Assignment">
                          {assignable && options ? (
                            <Detail label="Developer" control>
                              <AssignControl
                                ticket={ref}
                                areas={options.areas}
                                people={options.people}
                                areaId={t.areaId ?? ""}
                                assigneeId={t.assigneeId ?? ""}
                                assigneeName={t.assignee?.name ?? null}
                              />
                            </Detail>
                          ) : (
                            <Detail label="Developer">
                              {t.assignee?.name ?? <Unset>Not assigned</Unset>}
                            </Detail>
                          )}
                          <Detail label="Module">
                            {t.area ? (
                              areaPath(t.area)
                            ) : (
                              <Unset>Module not set</Unset>
                            )}
                          </Detail>
                        </DetailGroup>
                        <DetailGroup title="Classification">
                          <Detail
                            label="Category"
                            tip="Chosen when the ticket is filed. The developer can correct it once they identify the bug. Module progress on the Dashboard counts by category."
                            control={canCategorize(t, me)}
                          >
                            {canCategorize(t, me) ? (
                              <CategoryControl
                                ticket={ref}
                                category={t.category}
                              />
                            ) : t.category ? (
                              CATEGORY_LABELS[t.category]
                            ) : (
                              <Unset>{NO_CATEGORY}</Unset>
                            )}
                          </Detail>
                          {t.severity ? (
                            <Detail label="Severity">
                              <LevelLabel value={t.severity as SeverityValue} />
                            </Detail>
                          ) : null}
                          <Detail label="Priority">
                            <LevelLabel value={t.priority} />
                          </Detail>
                        </DetailGroup>
                        <DetailGroup title="Environment">
                          <Detail label="Found in">
                            {t.foundIn || <Unset>Not set</Unset>}
                          </Detail>
                          <Detail label="Device type">
                            {t.deviceType ? (
                              DEVICE_LABELS[t.deviceType as DeviceType]
                            ) : (
                              <Unset>Not set</Unset>
                            )}
                          </Detail>
                        </DetailGroup>
                      </div>
                      {/* Who filed it and when, as one quiet line under the fields. */}
                      <dl className="flex flex-wrap gap-x-6 gap-y-1.5 border-t border-line2 bg-surface2 px-5 py-3 text-[0.8438rem]">
                        <FootFact label="Reported by">
                          {t.reporter.name}
                        </FootFact>
                        <FootFact label="Filed">
                          {formatDateTime(t.createdAt)}
                        </FootFact>
                        {t.closedAt ? (
                          <FootFact label="Closed">
                            {formatDateTime(t.closedAt)}
                          </FootFact>
                        ) : null}
                      </dl>
                    </section>
                    <section
                      aria-labelledby="report-title"
                      className="border-t border-line px-5 pt-5 pb-5"
                    >
                      <h2 id="report-title" className="text-lg font-semibold">
                        Report
                      </h2>
                      {t.description ? (
                        <p className="mt-2.5 max-w-[72ch] text-[0.9375rem] leading-[1.6] wrap-anywhere whitespace-pre-wrap text-ink2">
                          {t.description}
                        </p>
                      ) : null}
                      <Evidence files={t.attachments} />
                    </section>
                  </Card>
                </TicketPane>

                <TicketPane tab="conversation">
                  <section
                    aria-labelledby="talk-title"
                    className="desk:min-h-0 desk:flex-1"
                  >
                    {/* Not clipped, so the Attach menu and the reply's markup dialog aren't cut off.
                      Messenger-style, on every screen: the card is one fixed height, as tall as the window allows under the
                      top bar (big screens: the rest of the panel), and never grows with the conversation. The messages
                      scroll inside it, opened at the newest one, and the reply box stays at the bottom. */}
                    <Card className="h-[calc(100dvh-9rem)] min-h-[28rem] overflow-visible max-md:h-[calc(100dvh-8.5rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] max-md:min-h-[22rem] desk:h-full desk:min-h-0">
                      <h2
                        id="talk-title"
                        className="shrink-0 px-5 pt-5 pb-1 text-lg font-semibold"
                      >
                        Conversation
                      </h2>
                      <div
                        id="ticket-thread"
                        tabIndex={0}
                        aria-label="Messages and history"
                        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-4 pb-5 outline-none [scrollbar-gutter:stable] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                      >
                        <Thread t={t} meId={me.id} now={now} />
                      </div>
                      <ScrollToLatest
                        targetId="ticket-thread"
                        version={t.lastActivityAt.toISOString()}
                      />
                      <div
                        id="ticket-reply"
                        className="max-h-[60%] shrink-0 scroll-mb-5 overflow-y-auto border-t border-line2 px-5 pt-4 pb-5"
                      >
                        <CommentForm ticket={ref} replyTo={replyTo ?? ""} />
                      </div>
                    </Card>
                  </section>
                </TicketPane>
              </div>
            </ImageGallery>
          </div>

          <TicketPane tab="details">
            {/* The log sits beside Report and Details on wide screens and stays in view while they scroll. */}
            <aside className="flex min-w-0 flex-[1_1_20rem] flex-col gap-6 xl:sticky xl:top-28 desk:static! desk:h-full">
              <ActivityLog entries={log} />
            </aside>
          </TicketPane>
        </div>
      </TicketTabs>
    </>
  );
}

/** Every movement on the ticket with its exact time, newest first. */
function ActivityLog({ entries }: { entries: LogEntry[] }) {
  return (
    <section aria-labelledby="log-title" className="desk:min-h-0 desk:flex-1">
      <Card className="desk:h-full">
        <h2
          id="log-title"
          className="shrink-0 px-5 pt-5 pb-3 text-lg font-semibold"
        >
          Activity log
        </h2>
        <ol
          className="max-h-[26.25rem] overflow-y-auto overscroll-contain pb-2 xl:max-h-[calc(100dvh-13rem)] desk:max-h-none! desk:min-h-0 desk:flex-1"
          aria-label="Activity log, newest first"
        >
          {[...entries].reverse().map((e) => (
            <li
              key={`${e.kind}-${e.id}`}
              className="border-t border-line2 px-5 py-2.5 text-[0.8438rem] leading-[1.4]"
            >
              <strong className="font-semibold">{e.who}</strong>{" "}
              <span className="text-body2">{e.text}</span>
              {e.note ? (
                <div
                  className="mt-0.5 line-clamp-2 text-muted-foreground"
                  title={e.note}
                >
                  “{e.note}”
                </div>
              ) : null}
              <time
                className="mt-0.5 block font-mono text-[0.7813rem] text-muted-foreground tabular-nums"
                dateTime={e.at.toISOString()}
              >
                {formatDateTime(e.at)}
              </time>
            </li>
          ))}
        </ol>
      </Card>
    </section>
  );
}

/** One column of the Details sheet: a small heading over its fields. */
function DetailGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <h3 className="text-[0.75rem] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
        {title}
      </h3>
      <dl className="mt-3 grid gap-4">{children}</dl>
    </div>
  );
}

/** A field: the label on top, the value under it. The label always shows in full; only the value wraps. `control`: a value people can change. */
function Detail({
  label,
  tip,
  control,
  children,
}: {
  label: string;
  tip?: string;
  control?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1.5 text-[0.8125rem] text-body2">
        {label}
        {tip ? <InfoTip label={label} text={tip} /> : null}
      </dt>
      <dd
        className={cn(
          "mt-1 min-w-0 text-[0.9375rem] font-medium wrap-anywhere",
          control && "font-normal",
        )}
      >
        {children}
      </dd>
    </div>
  );
}

/** An empty value, quieter than a real one. */
function Unset({ children }: { children: React.ReactNode }) {
  return <span className="font-normal text-muted-foreground">{children}</span>;
}

function FootFact({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}
