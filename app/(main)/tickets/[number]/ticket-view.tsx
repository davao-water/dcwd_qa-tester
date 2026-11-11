import { notFound } from "next/navigation";
import { connection } from "next/server";
import { TicketXIcon } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { requireAction } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { buildActivityLog } from "@/lib/tickets/log";
import { ticketStore } from "@/lib/tickets/store";
import {
  allowedTransitions,
  canAssignTicket,
  canHandBack,
  canDeleteTicket,
  canEditTicket,
  isDone,
} from "@/lib/tickets/workflow";
import { ticketFormOptions } from "@/lib/tickets/form-options";
import { ActivityLog } from "./_view/activity-log";
import { ConversationCard } from "./_view/conversation-card";
import { DetailsCard } from "./_view/details-card";
import { TicketHeader } from "./_view/ticket-header";
import { DraftCleanup } from "./draft-cleanup";
import { galleryImages } from "@/components/conversation/conversation";
import { ImageGallery } from "@/components/conversation/image-viewer";
import { MarkRead } from "@/components/conversation/mark-read";
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

  const moves = allowedTransitions(t, me);
  const editable = canEditTicket(t, me);
  const deletable = canDeleteTicket(t, me);
  const log = buildActivityLog(t);
  const assignable = canAssignTicket(t, me) && !isDone(t.status);
  // Won't fix can hand the ticket back to QA with a recommended developer, so that person needs the list too.
  const handsBack = canHandBack(t, me);
  const options = editable || assignable || handsBack ? await ticketFormOptions(db) : null;
  const now = new Date();

  const header = (
    <TicketHeader
      t={t}
      me={me}
      moves={moves}
      options={options}
      editable={editable}
      deletable={deletable}
      handsBack={handsBack}
      now={now}
    />
  );

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
                  <DetailsCard t={t} me={me} assignable={assignable} options={options} />
                </TicketPane>

                <TicketPane tab="conversation">
                  <ConversationCard t={t} meId={me.id} now={now} />
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
