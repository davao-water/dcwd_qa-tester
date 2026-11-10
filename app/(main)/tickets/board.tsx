"use client";

import Link from "next/link";
import { useId, useRef, useState } from "react";
import { ArrowDownToLineIcon } from "lucide-react";
import { StatusPill } from "@/components/status-pill";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  boardColumn,
  boardColumnOf,
  movesInto,
  type BoardColumnKey,
} from "@/lib/tickets/board";
import type { Transition } from "@/lib/tickets/workflow";
import { cn } from "@/lib/utils";
import type { AreaOption, AssigneeOption } from "./_form/types";
import { Card } from "./_board/card";
import { ColumnTabs } from "./_board/column-tabs";
import { TaskDialog } from "./_board/task-dialog";
import type { BoardCard, BoardColumnData, Task } from "./_board/types";
import { useQuickMove } from "./_board/use-quick-move";

export type { BoardCard, BoardColumnData } from "./_board/types";

// The Board view of the tickets page, like ClickUp's or Planner's: a column per stage (lib/tickets/board.ts) and a
// compact card per ticket. Drag a card to another column to move it: only the columns the workflow allows light up. A
// move without a note (Start work, Mark fixed, Verified, Close) happens at once with a few seconds to Undo before it is
// saved and anyone is notified; one that needs a note opens the same dialog as on the ticket page. Each card's ⋯ menu
// makes any move through that dialog (phones, keyboards, or to add a note) and assigns the developer. The page loads the
// data and checks access; the actions check it again.

export function TicketBoard({
  columns: fromServer,
  assign,
  developers,
}: {
  columns: BoardColumnData[];
  assign: { areas: AreaOption[]; people: AssigneeOption[] } | null;
  /** Who a developer can recommend when Won't fix hands a ticket back to QA. */
  developers: { id: string; name: string }[];
}) {
  const [drag, setDrag] = useState<BoardCard | null>(null);
  const dragging = useRef<BoardCard | null>(null);
  const [over, setOver] = useState<BoardColumnKey | null>(null);
  const [task, setTask] = useState<Task | null>(null);
  const [open, setOpen] = useState(false);
  // Refs and generated ids, not fixed ones: Next keeps recently visited pages mounted but hidden, so another copy of
  // the board can be in the document.
  const scroller = useRef<HTMLDivElement>(null);
  const uid = useId();


  const { columns, quickMove } = useQuickMove(fromServer);

  const start = (t: Task) => {
    setTask(t);
    setOpen(true);
  };
  const move = (
    card: BoardCard,
    moves: Transition[],
    column: BoardColumnKey | null,
  ) =>
    start({
      kind: "move",
      card,
      moves,
      move: moves.length === 1 ? moves[0] : null,
      column,
    });
  const endDrag = () => {
    dragging.current = null;
    setDrag(null);
    setOver(null);
  };


  return (
    // Big screens (D21): the board takes the rest of the window and each column scrolls inside itself.
    <div
      data-full-width
      className="grid gap-3 desk:flex desk:min-h-0 desk:flex-1 desk:flex-col"
    >
      <ColumnTabs columns={columns} board={scroller} />
      <div
        ref={scroller}
        className="relative -mx-5 flex snap-x snap-mandatory scroll-px-5 items-start gap-3 overflow-x-auto px-5 pb-2 md:mx-0 md:items-stretch md:snap-none md:px-0 md:pb-3 desk:min-h-0 desk:flex-1"
        aria-label="Ticket board"
        role="region"
      >
        {columns.map((data) => {
          const col = boardColumn(data.key);
          const targets = drag ? movesInto(col.key, drag.moves) : [];
          const droppable = targets.length > 0;
          const source = !!drag && boardColumnOf(drag.status) === col.key;
          const accept = (e: React.DragEvent) => {
            if (!droppable) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            if (over !== col.key) setOver(col.key);
          };
          return (
            <section
              key={col.key}
              data-column={col.key}
              aria-labelledby={`${uid}-${col.key}`}
              onDragEnter={accept}
              onDragOver={accept}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null))
                  setOver((o) => (o === col.key ? null : o));
              }}
              onDrop={(e) => {
                e.preventDefault();
                const card = drag;
                endDrag();
                if (!card || !droppable) return;
                const [only] = targets;
                if (
                  targets.length === 1 &&
                  !only.needsNote &&
                  !only.needsDuplicate
                )
                  quickMove(card, only);
                else move(card, targets, col.key);
              }}
              className={cn(
                "relative flex w-[min(20rem,85vw)] shrink-0 snap-start flex-col rounded-[0.875rem] bg-surface2 outline-2 -outline-offset-2 outline-transparent transition-[opacity,background-color,outline-color] duration-150 outline-dashed",
                "md:h-[max(24rem,calc(100dvh-21.25rem))] md:w-auto md:min-w-[14rem] md:flex-1 md:basis-0 desk:h-auto!",
                drag && !source && !droppable && "opacity-45",
                droppable && "outline-acc-b",
                droppable && over === col.key && "bg-acc-t outline-acc",
              )}
            >
              <header
                className="flex items-center gap-2 px-3 pt-3 pb-2"
                title={col.hint}
              >
                <h2 id={`${uid}-${col.key}`} className="flex">
                  <StatusPill tone={col.tone}>{col.label}</StatusPill>
                </h2>
                {data.inView || data.total ? (
                  <span className="text-[0.8125rem] font-semibold text-muted-foreground tabular-nums">
                    {data.total}
                    <span className="sr-only">
                      {" "}
                      ticket{data.total === 1 ? "" : "s"}
                    </span>
                  </span>
                ) : null}
              </header>
              {data.cards.length ? (
                <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain px-2 pb-2">
                  {data.cards.map((card) => (
                    <Card
                      key={card.id}
                      card={card}
                      sideState={
                        col.statuses.length > 1 &&
                        card.status !== col.statuses[0]
                      }
                      dragged={drag?.id === card.id}
                      onDragStart={() => {
                        dragging.current = card;
                        // Next tick, so the browser takes the drag image before the card fades.
                        setTimeout(
                          () => dragging.current === card && setDrag(card),
                          0,
                        );
                      }}
                      onDragEnd={endDrag}
                      onMove={(m) => move(card, [m], null)}
                      onAssign={() => start({ kind: "assign", card })}
                    />
                  ))}
                </ul>
              ) : (
                <p className="mx-2 mb-2 rounded-[0.625rem] border border-dashed border-line px-3 py-6 text-center text-[0.8125rem] leading-snug text-muted-foreground">
                  {data.inView
                    ? col.hint
                    : col.key === "done"
                      ? "Finished tickets show under Done and All."
                      : "Not in this view."}
                </p>
              )}
              {data.more ? (
                <Link
                  href={data.more}
                  className="mx-2 mb-2 rounded-lg px-2 py-1.5 text-center text-[0.8125rem] font-medium text-acc-ink hover:bg-acc-t2"
                >
                  {data.cards.length} of {data.total} shown · See all in the
                  list
                </Link>
              ) : null}
              {droppable ? (
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-2 bottom-2 flex items-center justify-center gap-1.5 rounded-[0.625rem] border-2 border-dashed border-acc bg-card/95 px-3 py-3 text-center text-[0.8438rem] font-semibold text-acc-ink shadow-[0_0.5rem_1.5rem_rgba(20,22,40,0.12)]"
                >
                  <ArrowDownToLineIcon className="size-4 shrink-0" />
                  {targets.length === 1
                    ? targets[0].label
                    : `${targets
                        .slice(0, -1)
                        .map((m) => m.label)
                        .join(", ")} or ${targets.at(-1)!.label}`}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          {task ? (
            <TaskDialog
              task={task}
              open={open}
              assign={assign}
              developers={developers}
              onPick={(m) =>
                task.kind === "move" && setTask({ ...task, move: m })
              }
              onDone={() => setOpen(false)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
