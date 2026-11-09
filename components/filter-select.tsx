"use client";

import { useRef } from "react";
import { ACTIVE_FILTER } from "@/components/active-filter";
import { SelectField, type SelectOption, type SelectOptionGroup } from "@/components/select-field";
import { cn } from "@/lib/utils";

/**
 * A filter (Tickets, Team) that applies as soon as a choice is made, by submitting its GET form. Without scripts
 * the form still works through its own submit button. `active`: whether it is narrowing the list; by default, when it
 * has a value. Pass false when a tab, not the person, set it.
 */
export function FilterSelect({
  active,
  ...props
}: {
  id: string;
  name: string;
  defaultValue: string;
  options?: SelectOption[];
  groups?: SelectOptionGroup[];
  active?: boolean;
}) {
  const box = useRef<HTMLSpanElement>(null);
  return (
    <span ref={box} className="contents">
      <SelectField
        {...props}
        className={cn((active ?? props.defaultValue !== "") && ACTIVE_FILTER)}
        // The select's hidden input updates after this call, so the form is sent on the next tick.
        onValueChange={() => window.setTimeout(() => box.current?.closest("form")?.requestSubmit(), 0)}
      />
    </span>
  );
}
