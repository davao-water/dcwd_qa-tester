"use client";

import Link from "next/link";
import { useRef } from "react";
import { Menu } from "@base-ui/react/menu";
import { EllipsisIcon, SquareArrowOutUpRightIcon, UserRoundPlusIcon } from "lucide-react";
import type { Transition } from "@/lib/tickets/workflow";
import { TicketStatusPill } from "@/components/ticket-badges";
import type { BoardCard } from "./types";

const item =
  "flex h-9 cursor-default items-center gap-2.5 rounded-md px-3 text-[0.875rem] outline-hidden select-none data-highlighted:bg-acc-t2 data-highlighted:text-acc-ink [&_svg]:size-4 [&_svg]:text-ink2 data-highlighted:[&_svg]:text-primary-text";

/** Open, the status moves, and assigning. Shown on hover with a mouse; always there on touch screens. */
export function CardMenu({
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
