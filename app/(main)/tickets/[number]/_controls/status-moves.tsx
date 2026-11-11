"use client";

import { FormDialog } from "@/components/form-dialog";
import { Button } from "@/components/ui/button";
import { isRedMove, moveLayout } from "@/lib/tickets/moves";
import { STATUS_LABELS, type TicketStatus, type Transition } from "@/lib/tickets/workflow";
import { cn } from "@/lib/utils";
import { Menu } from "@base-ui/react/menu";
import { ChevronDownIcon } from "lucide-react";
import { useState } from "react";
import { MoveForm } from "./move-form";
import type { Ref } from "@/lib/tickets/ticket-ref";

/**
 * The ticket's moves for this person (lib/tickets/moves.ts): their next step as the main button, at most one equally
 * common second button (Reopen while retesting), and everything else in a "More" menu, other outcomes first, then
 * moves that undo a mistake. Each opens a short dialog for the note.
 */
export function StatusMoves({
  ticket,
  status,
  moves,
  handBack,
}: {
  ticket: Ref;
  status: TicketStatus;
  moves: Transition[];
  /** Developers to recommend when Won't fix hands the ticket back; null when this person can't hand it back. */
  handBack?: { developers: { id: string; name: string }[] } | null;
}) {
  const [picked, setPicked] = useState<Transition | null>(null);
  if (!moves.length) return null;
  const { main, second, outcomes, undo } = moveLayout(moves);
  const description = (m: Transition) =>
    `${STATUS_LABELS[status]} → ${STATUS_LABELS[m.to]}`;
  const button = (m: Transition, primary: boolean) => (
    <FormDialog
      key={m.to}
      title={m.label}
      description={description(m)}
      trigger={
        <Button
          variant={primary ? "default" : isRedMove(m) ? "ghost-red" : "outline"}
        >
          {m.label}
        </Button>
      }
    >
      {(close) => <MoveForm ticket={ticket} move={m} reasons={moves.filter((x) => x.within === m.to)} handBack={handBack} onDone={close} />}
    </FormDialog>
  );
  const item =
    "flex w-full cursor-pointer items-center rounded-lg px-3 py-2 text-sm outline-none data-highlighted:bg-row-hover";
  const group =
    "px-3 pt-1.5 pb-1 text-[0.75rem] font-semibold tracking-[0.04em] text-muted-foreground uppercase";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {outcomes.length || undo.length ? (
        <Menu.Root>
          <Menu.Trigger
            render={
              <Button
                type="button"
                variant="outline"
                className="data-popup-open:bg-acc-t2"
              />
            }
          >
            {main || second ? "More" : "Moves"} <ChevronDownIcon aria-hidden />
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner
              side="bottom"
              align="end"
              sideOffset={6}
              className="isolate z-50"
            >
              <Menu.Popup className="w-56 origin-(--transform-origin) rounded-xl bg-popover p-1.5 text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-150 ease-(--ease-out) data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
                {outcomes.length ? (
                  <Menu.Group>
                    <Menu.GroupLabel className={group}>
                      Other outcomes
                    </Menu.GroupLabel>
                    {outcomes.map((m) => (
                      <Menu.Item
                        key={m.to}
                        className={cn(
                          item,
                          isRedMove(m) &&
                            "text-destructive-text data-highlighted:bg-bad-w",
                        )}
                        onClick={() => setPicked(m)}
                      >
                        {m.label}
                      </Menu.Item>
                    ))}
                  </Menu.Group>
                ) : null}
                {outcomes.length && undo.length ? (
                  <Menu.Separator className="-mx-1.5 my-1 h-px bg-line2" />
                ) : null}
                {undo.length ? (
                  <Menu.Group>
                    <Menu.GroupLabel className={group}>
                      Undo a mistake
                    </Menu.GroupLabel>
                    {undo.map((m) => (
                      <Menu.Item
                        key={m.to}
                        className={item}
                        onClick={() => setPicked(m)}
                      >
                        {m.label}
                      </Menu.Item>
                    ))}
                  </Menu.Group>
                ) : null}
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      ) : null}
      {second ? button(second, false) : null}
      {main ? button(main, true) : null}
      {/* A move picked from the menu opens the same dialog as a button would. */}
      <FormDialog
        title={picked?.label ?? ""}
        description={picked ? description(picked) : undefined}
        open={!!picked}
        onOpenChange={(o) => !o && setPicked(null)}
      >
        {(close) =>
          picked ? (
            <MoveForm ticket={ticket} move={picked} reasons={moves.filter((x) => x.within === picked.to)} handBack={handBack} onDone={close} />
          ) : null
        }
      </FormDialog>
    </div>
  );
}
