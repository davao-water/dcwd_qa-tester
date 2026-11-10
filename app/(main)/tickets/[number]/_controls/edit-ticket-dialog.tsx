"use client";

import { FormDialog } from "@/components/form-dialog";
import { Button } from "@/components/ui/button";
import { TicketForm } from "../../ticket-form";
import type { AreaOption, AssigneeOption, TicketValues } from "../../_form/types";

/** Edit the ticket's details in a dialog, with the same form as New ticket. */
export function EditTicketDialog({
  ticket,
  areas,
  people,
  open,
  onOpenChange,
}: {
  ticket: TicketValues;
  areas: AreaOption[];
  people: AssigneeOption[];
  /** Opened from the ⋯ More menu instead of its own button. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <FormDialog
      wide
      title={`Edit #${ticket.number}`}
      open={open}
      onOpenChange={onOpenChange}
      trigger={
        open === undefined ? (
          <Button variant="outline" size="sm">
            Edit
          </Button>
        ) : undefined
      }
    >
      {(close) => (
        <TicketForm
          areas={areas}
          people={people}
          canAssign={false}
          ticket={ticket}
          onDone={close}
        />
      )}
    </FormDialog>
  );
}
