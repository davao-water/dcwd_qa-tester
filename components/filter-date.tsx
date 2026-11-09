"use client";

import { ACTIVE_FILTER } from "@/components/active-filter";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * A date filter (Tickets) that applies as soon as a full date is picked or the field is cleared, by submitting its GET
 * form, like FilterSelect. Without scripts the form still works through its own submit button. Highlighted while set.
 */
export function FilterDate(props: { id: string; name: string; defaultValue: string; min?: string; max?: string }) {
  return (
    <Input
      type="date"
      {...props}
      className={cn(props.defaultValue !== "" && ACTIVE_FILTER)}
      onChange={(e) => {
        const v = e.currentTarget.value;
        if (v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v)) e.currentTarget.form?.requestSubmit();
      }}
    />
  );
}
