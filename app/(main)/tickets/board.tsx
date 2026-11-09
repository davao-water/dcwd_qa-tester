"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { Menu } from "@base-ui/react/menu";
import {
  ArrowDownToLineIcon,
  ArrowLeftIcon,
  EllipsisIcon,
  MessageSquareIcon,
  SquareArrowOutUpRightIcon,
  UserRoundIcon,
  UserRoundPlusIcon,
} from "lucide-react";
import { toast } from "sonner";
import { StatusPill } from "@/components/status-pill";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { initialFormState } from "@/lib/form";
import { initials } from "@/lib/format";
import {
  boardColumn,
  boardColumnOf,
  movesInto,
  type BoardColumnKey,
} from "@/lib/tickets/board";
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  TYPE_LABELS,
  type SeverityValue,
  type TicketStatus,
  type TicketType,
  type Transition,
} from "@/lib/tickets/workflow";
import { cn } from "@/lib/utils";
import { AssignForm, MoveForm } from "./[number]/ticket-controls";
import { moveTicket } from "./actions";
import {
  LevelTag,
  SeverityTag,
  TicketStatusPill,
  TYPE_ICON,
  typeStyle,
  UnreadDot,
} from "./ticket-bits";
import { PeekLink } from "./ticket-peek";
import type { AreaOption, AssigneeOption } from "./ticket-form";

// The Board view of the tickets page, like ClickUp's or Planner's: a column per stage (lib/tickets/board.ts) and a
// compact card per ticket. Drag a card to another column to move it: only the columns the workflow allows light up. A
// move without a note (Start work, Mark fixed, Verified, Close) happens at once with a few seconds to Undo before it is
// saved and anyone is notified; one that needs a note opens the same dialog as on the ticket page. Each card's ⋯ menu
// makes any move through that dialog (phones, keyboards, or to add a note) and assigns the developer. The page loads the
// data and checks access; the actions check it again.

/** How long a dropped card waits, with Undo, before the move is saved and people are notified. */
const UNDO_MS = 5000;

/** A dropped card, shown in its new column until fresh data from the server has it there too. */
type Pending = { from: TicketStatus; to: TicketStatus };

export type BoardCard = {
  id: string;
  number: number;
  type: TicketType;
  title: string;
  status: TicketStatus;
  severity: SeverityValue | null;
  priority: string;
  /** "Billing › Meter Reading" */
  area: string | null;
  areaId: string | null;
  comments: number;
  /** "3 h ago", worked out on the server so it matches the first paint, and the exact time for its tooltip. */
  ago: string;
  at: string;
  atLabel: string;
  /** The developer, or on a developer's own board the QA tester who filed it. */
  person: { role: string; name: string | null };
  assigneeId: string | null;
  unread: boolean;
  /** The status moves the viewer may make now (allowedTransitions). */
  moves: Transition[];
  canAssign: boolean;
};

/** `inView`: false for a column the chosen view leaves empty (Done under Open); it stays as a place to drop. */
export type BoardColumnData = {
  key: BoardColumnKey;
  total: number;
  cards: BoardCard[];
  more: string | null;
  inView: boolean;
};

type Task =
  | {
      kind: "move";
      card: BoardCard;
      moves: Transition[];
      move: Transition | null;
      column: BoardColumnKey | null;
    }
  | { kind: "assign"; card: BoardCard };

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

  const [pending, setPending] = useState<Record<string, Pending>>({});
  // Fresh data from the server: forget the drops it now shows (or that someone else's change overtook).
  const [seen, setSeen] = useState(fromServer);
  if (seen !== fromServer) {
    setSeen(fromServer);
    setPending((p) => stillPending(p, fromServer));
  }
  const columns = withPending(fromServer, pending);
  // Drops still in their Undo time, each with a token so a late callback from an older drop of the same card does
  // nothing. Closing the tab now would lose them, so the browser asks first.
  const unsent = useRef(new Map<string, object>());
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (unsent.current.size) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

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

  /** Moves the card now, and saves the move once the Undo toast closes without Undo. */
  const quickMove = (card: BoardCard, m: Transition) => {
    const token = {};
    unsent.current.set(card.id, token);
    setPending((p) => ({ ...p, [card.id]: { from: card.status, to: m.to } }));
    const forget = () => setPending((p) => without(p, card.id));
    const fail = (message: string) => {
      forget();
      toast.error(`#${card.number} wasn't moved`, { description: message });
    };
    const save = () => {
      if (unsent.current.get(card.id) !== token) return; // undone, or already saving
      unsent.current.delete(card.id);
      const fd = new FormData();
      fd.set("id", card.id);
      fd.set("number", String(card.number));
      fd.set("to", m.to);
      moveTicket(initialFormState, fd).then(
        (r) =>
          r.ok
            ? undefined
            : fail(r.message ?? "Refresh the page and try again."),
        () => fail("Check your connection and try again."),
      );
    };
    toast(`Moved #${card.number} to ${STATUS_LABELS[m.to]}`, {
      duration: UNDO_MS,
      action: {
        label: "Undo",
        onClick: () => {
          if (unsent.current.get(card.id) !== token) return;
          unsent.current.delete(card.id);
          forget();
        },
      },
      onAutoClose: save,
      onDismiss: save,
    });
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

const without = <T,>(map: Record<string, T>, id: string) => {
  const next = { ...map };
  delete next[id];
  return next;
};

/** Keeps the drops the server doesn't show yet: the card is still there with its old status. */
function stillPending(
  pending: Record<string, Pending>,
  columns: BoardColumnData[],
) {
  const status = new Map(
    columns.flatMap((c) =>
      c.cards.map((card) => [card.id, card.status] as const),
    ),
  );
  return Object.fromEntries(
    Object.entries(pending).filter(([id, p]) => status.get(id) === p.from),
  );
}

/** The board with dropped cards already in their new columns, at the top, until the server has them there. */
function withPending(
  columns: BoardColumnData[],
  pending: Record<string, Pending>,
): BoardColumnData[] {
  const moved: BoardCard[] = [];
  const out = columns.map((c) => {
    const cards = c.cards.filter((card) => {
      const p = pending[card.id];
      if (!p || card.status !== p.from) return true;
      // Nothing to do with it until it's saved.
      moved.push({
        ...card,
        status: p.to,
        ago: "just now",
        unread: false,
        moves: [],
        canAssign: false,
      });
      return false;
    });
    return { ...c, cards, total: c.total - (c.cards.length - cards.length) };
  });
  for (const card of moved) {
    const c = out.find((x) => x.key === boardColumnOf(card.status))!;
    c.cards = [card, ...c.cards];
    c.total += 1;
  }
  return out;
}

/** Phones show one column at a time; these jump between them and show which one is in view. */
function ColumnTabs({
  columns,
  board,
}: {
  columns: BoardColumnData[];
  board: RefObject<HTMLDivElement | null>;
}) {
  const [active, setActive] = useState<BoardColumnKey>(columns[0].key);
  const tabs = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = board.current;
    if (!el) return;
    const onScroll = () => {
      const pad = parseFloat(getComputedStyle(el).paddingLeft) || 0;
      let best: { key: BoardColumnKey; d: number } | null = null;
      for (const col of el.querySelectorAll<HTMLElement>(
        ":scope > [data-column]",
      )) {
        const d = Math.abs(col.offsetLeft - pad - el.scrollLeft);
        if (!best || d < best.d)
          best = { key: col.dataset.column as BoardColumnKey, d };
      }
      if (best) setActive(best.key);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [board]);

  // Keep the column in view's tab visible too (only when it's off the strip, so a tap never scrolls it).
  useEffect(() => {
    const strip = tabs.current;
    const tab = strip?.querySelector<HTMLElement>(`[data-column="${active}"]`);
    if (!strip || !tab) return;
    if (
      tab.offsetLeft < strip.scrollLeft ||
      tab.offsetLeft + tab.offsetWidth > strip.scrollLeft + strip.clientWidth
    ) {
      strip.scrollTo({ left: tab.offsetLeft - 20, behavior: "smooth" });
    }
  }, [active]);

  return (
    <nav
      ref={tabs}
      aria-label="Board columns"
      className="relative -mx-5 flex gap-2 overflow-x-auto px-5 [scrollbar-width:none] md:hidden"
    >
      {columns.map((c) => (
        <button
          key={c.key}
          type="button"
          data-column={c.key}
          aria-current={active === c.key ? "true" : undefined}
          onClick={() =>
            board.current
              ?.querySelector(`:scope > [data-column="${c.key}"]`)
              ?.scrollIntoView({
                behavior: "smooth",
                inline: "start",
                block: "nearest",
              })
          }
          className={cn(
            "flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium whitespace-nowrap outline-none focus-visible:ring-3 focus-visible:ring-acc/30",
            active === c.key
              ? "bg-foreground text-background"
              : "bg-card text-ink2 shadow-[0_0.0625rem_0.125rem_rgba(20,22,40,0.06),0_0.125rem_0.5rem_rgba(20,22,40,0.04)]",
          )}
        >
          {boardColumn(c.key).label}
          {c.inView || c.total ? (
            <span
              className={cn(
                "tabular-nums",
                active === c.key ? "opacity-70" : "text-muted-foreground",
              )}
            >
              {c.total}
            </span>
          ) : null}
        </button>
      ))}
    </nav>
  );
}

function Card({
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

function Person({ person }: { person: BoardCard["person"] }) {
  const label = `${person.role}: ${person.name ?? "not assigned"}`;
  return (
    <span
      title={label}
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-full text-[0.625rem] font-semibold",
        person.name
          ? "bg-acc-t text-acc-ink"
          : "border border-dashed border-line text-muted-foreground",
      )}
    >
      {person.name ? (
        <span aria-hidden>{initials(person.name)}</span>
      ) : (
        <UserRoundIcon className="size-3.5" aria-hidden />
      )}
      <span className="sr-only">{label}</span>
    </span>
  );
}

const item =
  "flex h-9 cursor-default items-center gap-2.5 rounded-md px-3 text-[0.875rem] outline-hidden select-none data-highlighted:bg-acc-t2 data-highlighted:text-acc-ink [&_svg]:size-4 [&_svg]:text-ink2 data-highlighted:[&_svg]:text-primary-text";

/** Open, the status moves, and assigning. Shown on hover with a mouse; always there on touch screens. */
function CardMenu({
  card,
  onMove,
  onAssign,
}: {
  card: BoardCard;
  onMove: (m: Transition) => void;
  onAssign: () => void;
}) {
  // A choice that opens a dialog keeps focus there instead of handing it back to the ⋯ button.
  const handedOff = useRef(false);
  const handOff = (fn: () => void) => () => {
    handedOff.current = true;
    fn();
  };
  return (
    <Menu.Root onOpenChange={(next) => next && (handedOff.current = false)}>
      <Menu.Trigger
        aria-label={`Actions for #${card.number}`}
        className="relative z-10 -my-1 flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-surface3 hover:text-foreground focus-visible:opacity-100 focus-visible:ring-3 focus-visible:ring-acc/30 data-popup-open:bg-surface3 data-popup-open:text-foreground pointer-fine:opacity-0 pointer-fine:group-hover/card:opacity-100 pointer-fine:group-focus-within/card:opacity-100 pointer-fine:data-popup-open:opacity-100"
      >
        <EllipsisIcon className="size-4" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner
          side="bottom"
          align="end"
          sideOffset={4}
          className="isolate z-50"
        >
          <Menu.Popup
            finalFocus={() => !handedOff.current}
            className="w-64 origin-(--transform-origin) rounded-xl bg-popover p-1.5 text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-150 ease-(--ease-out) data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
          >
            <Menu.Item
              className={item}
              render={<Link href={`/tickets/${card.number}`} />}
            >
              <SquareArrowOutUpRightIcon /> Open full page
            </Menu.Item>
            {card.moves.length ? (
              <>
                <Menu.Separator className="-mx-1.5 my-1 h-px bg-line2" />
                <Menu.Group>
                  <Menu.GroupLabel className="px-3 pt-1.5 pb-1 text-[0.7188rem] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
                    Move
                  </Menu.GroupLabel>
                  {card.moves.filter((m) => !m.within).map((m) => (
                    <Menu.Item
                      key={m.to}
                      className={item}
                      onClick={handOff(() => onMove(m))}
                    >
                      <span className="min-w-0 flex-1 truncate">{m.label}</span>
                      <TicketStatusPill
                        status={m.to}
                        className="h-5 px-2 text-[0.6875rem]"
                      />
                    </Menu.Item>
                  ))}
                </Menu.Group>
              </>
            ) : null}
            {card.canAssign ? (
              <>
                <Menu.Separator className="-mx-1.5 my-1 h-px bg-line2" />
                <Menu.Item className={item} onClick={handOff(onAssign)}>
                  <UserRoundPlusIcon />{" "}
                  {card.assigneeId
                    ? "Reassign developer…"
                    : "Assign developer…"}
                </Menu.Item>
              </>
            ) : null}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

/** The dialog for a dropped card or a menu choice: pick the move if there are several, then its note; or assign. */
function TaskDialog({
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
