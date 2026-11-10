"use client";

import { FormMessage } from "@/components/form-field";
import { SelectField } from "@/components/select-field";
import { initialFormState } from "@/lib/form";
import { CATEGORY_LABELS, NO_CATEGORY, TICKET_CATEGORIES, type TicketCategoryValue } from "@/lib/tickets/workflow";
import { startTransition, useActionState } from "react";
import { categorizeTicket } from "../../actions";
import type { Ref } from "./ticket-ref";

/** The Category row for those allowed to change it (canCategorize). A choice saves straight away, with a line in the activity log. */
export function CategoryControl({
  ticket,
  category,
}: {
  ticket: Ref;
  category: TicketCategoryValue | null;
}) {
  const [state, action, pending] = useActionState(
    categorizeTicket,
    initialFormState,
  );
  const options = TICKET_CATEGORIES.map((c) => ({
    value: c,
    label: CATEGORY_LABELS[c],
  }));
  return (
    <div className="grid justify-items-start gap-1.5">
      <SelectField
        key={category ?? "none"}
        aria-label="Category"
        size="sm"
        className="w-full max-w-[12rem]"
        disabled={pending}
        defaultValue={category ?? ""}
        options={
          category ? options : [{ value: "", label: NO_CATEGORY }, ...options]
        }
        onValueChange={(next) => {
          if (!next) return;
          const fd = new FormData();
          fd.set("id", ticket.id);
          fd.set("number", String(ticket.number));
          fd.set("category", next);
          startTransition(() => action(fd));
        }}
      />
      <FormMessage state={state} />
    </div>
  );
}
