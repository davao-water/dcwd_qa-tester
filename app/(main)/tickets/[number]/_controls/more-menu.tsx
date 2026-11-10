"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Menu } from "@base-ui/react/menu";
import { EllipsisIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import type { AreaOption, AssigneeOption, TicketValues } from "../../_form/types";
import { DeleteTicketDialog } from "./delete-ticket-dialog";
import { EditTicketDialog } from "./edit-ticket-dialog";

/**
 * The ticket's ⋯ More menu: Edit and Delete, kept out of the way so the title row holds only the status moves. Each item
 * opens its usual dialog; Delete still asks for the exact title.
 */
export function TicketMoreMenu({
  edit,
  del,
}: {
  edit: {
    ticket: TicketValues;
    areas: AreaOption[];
    people: AssigneeOption[];
  } | null;
  del: {
    ticket: { id: string; number: number; title: string };
    replies: number;
    files: number;
  } | null;
}) {
  const [dialog, setDialog] = useState<"edit" | "delete" | null>(null);
  if (!edit && !del) return null;
  const item =
    "flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm outline-none data-highlighted:bg-row-hover [&_svg]:size-4";
  return (
    <>
      <Menu.Root>
        <Menu.Trigger
          render={
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="More actions"
              title="More actions"
              className="data-popup-open:bg-acc-t2"
            />
          }
        >
          <EllipsisIcon aria-hidden />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner
            side="bottom"
            align="end"
            sideOffset={6}
            className="isolate z-50"
          >
            <Menu.Popup className="w-48 origin-(--transform-origin) rounded-xl bg-popover p-1.5 text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-150 ease-(--ease-out) data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
              {edit ? (
                <Menu.Item className={item} onClick={() => setDialog("edit")}>
                  <PencilIcon aria-hidden /> Edit ticket
                </Menu.Item>
              ) : null}
              {del ? (
                <Menu.Item
                  className={cn(
                    item,
                    "text-destructive-text data-highlighted:bg-bad-w",
                  )}
                  onClick={() => setDialog("delete")}
                >
                  <Trash2Icon aria-hidden /> Delete ticket
                </Menu.Item>
              ) : null}
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
      {edit ? (
        <EditTicketDialog
          {...edit}
          open={dialog === "edit"}
          onOpenChange={(o) => setDialog(o ? "edit" : null)}
        />
      ) : null}
      {del ? (
        <DeleteTicketDialog
          {...del}
          open={dialog === "delete"}
          onOpenChange={(o) => setDialog(o ? "delete" : null)}
        />
      ) : null}
    </>
  );
}
