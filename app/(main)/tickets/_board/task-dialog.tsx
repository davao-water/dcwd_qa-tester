"use client";

import { ArrowLeftIcon } from "lucide-react";
import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { boardColumn } from "@/lib/tickets/board";
import { STATUS_LABELS, type Transition } from "@/lib/tickets/workflow";
import { AssignForm } from "../[number]/_controls/assign-form";
import { MoveForm } from "../[number]/_controls/move-form";
import { TicketStatusPill } from "@/components/ticket-badges";
import type { AreaOption, AssigneeOption } from "../_form/types";
import type { Task } from "./types";

/** The dialog for a dropped card or a menu choice: pick the move if there are several, then its note; or assign. */
export function TaskDialog({
  task,
  open,
  assign,
  developers,
  onPick,
  onDone,
}: {
  task: Task;
  open: boolean;
  assign: { areas: AreaOption[]; people: AssigneeOption[] } | null;
  developers: { id: string; name: string }[];
  onPick: (m: Transition | null) => void;
  onDone: () => void;
}) {
  const { card } = task;
  const ref = { id: card.id, number: card.number };
  const ticket = (
    <>
      <span className="font-mono">#{card.number}</span> {card.title}
    </>
  );

  if (task.kind === "assign") {
    return (
      <>
        <DialogHeader>
          <DialogTitle>
            {card.assigneeId ? "Reassign" : "Assign"} the developer
          </DialogTitle>
          <DialogDescription className="line-clamp-2">
            {ticket}
          </DialogDescription>
        </DialogHeader>
        {open && assign ? (
          <AssignForm
            ticket={ref}
            areas={assign.areas}
            people={assign.people}
            areaId={card.areaId ?? ""}
            assigneeId={card.assigneeId ?? ""}
            onDone={onDone}
            onCancel={onDone}
          />
        ) : null}
      </>
    );
  }

  const { move, moves, column } = task;
  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {move
            ? move.label
            : `Move to ${column ? boardColumn(column).label : "…"}`}
        </DialogTitle>
        <DialogDescription className="grid gap-0.5">
          <span className="line-clamp-2">{ticket}</span>
          <span>
            {STATUS_LABELS[card.status]} →{" "}
            {move ? STATUS_LABELS[move.to] : "pick how"}
          </span>
        </DialogDescription>
      </DialogHeader>
      {!open ? null : move ? (
        <div className="grid max-h-[70vh] gap-3 overflow-y-auto pr-1">
          {moves.length > 1 ? (
            <button
              type="button"
              onClick={() => onPick(null)}
              className="inline-flex w-fit items-center gap-1.5 text-[0.8125rem] text-muted-foreground hover:text-primary-text"
            >
              <ArrowLeftIcon className="size-3.5" aria-hidden /> Other choices
            </button>
          ) : null}
          <MoveForm
            ticket={ref}
            move={move}
            reasons={card.moves.filter((x) => x.within === move.to)}
            handBack={move.to === "WONT_FIX" && card.assigneeId ? { developers: developers.filter((d) => d.id !== card.assigneeId) } : null}
            onDone={onDone}
          />
        </div>
      ) : (
        <div className="grid gap-2">
          {moves.map((m) => (
            <button
              key={m.to}
              type="button"
              onClick={() => onPick(m)}
              className="flex items-center justify-between gap-3 rounded-[0.625rem] border border-line bg-card px-4 py-3 text-left text-[0.9063rem] font-medium outline-none transition-colors hover:border-acc-b hover:bg-acc-t2 focus-visible:border-acc focus-visible:ring-3 focus-visible:ring-acc/15"
            >
              {m.label}
              <TicketStatusPill status={m.to} />
            </button>
          ))}
        </div>
      )}
    </>
  );
}
