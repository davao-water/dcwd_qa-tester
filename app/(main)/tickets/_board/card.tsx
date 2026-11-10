"use client";

import { MessageSquareIcon } from "lucide-react";
import { PRIORITY_LABELS, TYPE_LABELS, type Transition } from "@/lib/tickets/workflow";
import { cn } from "@/lib/utils";
import { LevelTag, SeverityTag, TicketStatusPill, TYPE_ICON, typeStyle, UnreadDot } from "../ticket-bits";
import { PeekLink } from "../ticket-peek";
import { CardMenu } from "./card-menu";
import { Person } from "./person";
import type { BoardCard } from "./types";

/** One ticket on the board: drag it to another column, or use its ⋯ menu. */
export function Card({
  card,
  sideState,
  dragged,
  onDragStart,
  onDragEnd,
  onMove,
  onAssign,
}: {
  card: BoardCard;
  /** The ticket is in a side state of its column (Reopened in To do, Rejected in Done), so it shows its status. */
  sideState: boolean;
  dragged: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onMove: (m: Transition) => void;
  onAssign: () => void;
}) {
  const Icon = TYPE_ICON[card.type];
  const draggable = card.moves.length > 0;
  return (
    <li
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", `#${card.number} ${card.title}`);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className={cn(
        // The design system's board card: theme shadow, and on hover it lifts 1 px with a deeper shadow.
        "group/card relative grid shrink-0 grid-cols-[minmax(0,1fr)] gap-2 rounded-[0.625rem] border border-line bg-card py-3 pr-2.5 pl-3.5 shadow-(--shadow-card) transition-[border-color,box-shadow,opacity,transform] duration-150 ease-(--ease-out) hover:-translate-y-px hover:border-acc-b hover:shadow-(--shadow-hover)",
        draggable && "cursor-grab active:cursor-grabbing",
        dragged && "opacity-40",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-2.5 left-0 w-[0.1875rem] rounded-r-full bg-current",
          typeStyle(card.type).icon,
        )}
      />
      <div className="flex min-h-6 items-center gap-1.5 text-[0.75rem] text-muted-foreground">
        <span className="font-mono font-semibold text-ink2">
          #{card.number}
        </span>
        <span
          className="min-w-0 flex-1 truncate"
          title={card.area ?? undefined}
        >
          {card.area ? `· ${card.area}` : null}
        </span>
        {card.unread ? <UnreadDot /> : null}
        <CardMenu card={card} onMove={onMove} onAssign={onAssign} />
      </div>
      <PeekLink
        number={card.number}
        draggable={false}
        className={cn(
          "line-clamp-3 text-[0.875rem] leading-snug wrap-break-word outline-none after:absolute after:inset-0 after:rounded-[0.625rem] hover:text-primary-text focus-visible:after:ring-3 focus-visible:after:ring-acc/30",
          card.unread ? "font-semibold" : "font-medium",
        )}
      >
        {card.title}
      </PeekLink>
      <div className="flex flex-wrap items-center gap-1.5 text-[0.75rem] text-muted-foreground">
        <span
          title={TYPE_LABELS[card.type]}
          className={cn(
            "flex size-5 items-center justify-center rounded-md",
            typeStyle(card.type).tile,
          )}
        >
          <Icon className="size-3.5" aria-hidden />
          <span className="sr-only">{TYPE_LABELS[card.type]}</span>
        </span>
        {sideState ? (
          <TicketStatusPill
            status={card.status}
            className="h-5 px-2 text-[0.6875rem]"
          />
        ) : null}
        <SeverityTag severity={card.severity} />
        <LevelTag value={card.priority as keyof typeof PRIORITY_LABELS} />
        <span className="ml-auto flex items-center gap-2">
          {card.comments ? (
            <span
              className="inline-flex items-center gap-0.5"
              title={`${card.comments} repl${card.comments === 1 ? "y" : "ies"}`}
            >
              <MessageSquareIcon className="size-3" aria-hidden />{" "}
              {card.comments}
              <span className="sr-only">
                {" "}
                repl{card.comments === 1 ? "y" : "ies"}
              </span>
            </span>
          ) : null}
          <time
            dateTime={card.at}
            title={card.atLabel}
            className="whitespace-nowrap"
          >
            {card.ago}
          </time>
          <Person person={card.person} />
        </span>
      </div>
    </li>
  );
}
