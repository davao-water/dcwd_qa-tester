import Link from "next/link";
import type { Actor } from "@/lib/tickets/workflow";
import { formatDate, formatDateTime } from "@/lib/format";
import { nextStep, ticketFlow } from "@/lib/tickets/flow";
import { TICKET_TITLE_ID } from "@/lib/tickets/peek";
import type { TicketDetail } from "@/lib/tickets/store";
import type { DeviceType, SeverityValue, Transition } from "@/lib/tickets/workflow";
import type { ticketFormOptions } from "@/lib/tickets/form-options";
import { LevelLabel, TicketStatusPill, TicketTypeLabel } from "@/components/ticket-badges";
import { TicketMoreMenu } from "../_controls/more-menu";
import { StatusMoves } from "../_controls/status-moves";
import { TicketFlow } from "../ticket-flow";

/** The ticket's title row: number, title, status and who filed it; the moves and ⋯ More; then the flow of steps. */
export function TicketHeader({
  t,
  me,
  moves,
  options,
  editable,
  deletable,
  handsBack,
  now,
}: {
  t: TicketDetail;
  me: Actor;
  moves: Transition[];
  options: Awaited<ReturnType<typeof ticketFormOptions>> | null;
  editable: boolean;
  deletable: boolean;
  handsBack: boolean;
  now: Date;
}) {
  const ref = { id: t.id, number: t.number };
  return (
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
}
