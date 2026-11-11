"use client";

import { TICKET_TYPES, TYPE_LABELS, type TicketType } from "@/lib/tickets/workflow";
import { cn } from "@/lib/utils";
import { TYPE_ICON, TypeTile, typeStyle } from "@/components/ticket-badges";

const TYPE_HINTS: Record<TicketType, string> = {
  BUG: "Something in the ERP is wrong or broken.",
  SUGGESTION: "An idea for something new.",
  IMPROVEMENT: "Something that works but could be better.",
};

/** "What is it?": Bug, Suggestion or Improvement, as big radio buttons. */
export function TypePicker({ type, onType }: { type: TicketType; onType: (t: TicketType) => void }) {
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-2 text-sm font-medium">What is it?</legend>
      {/* Phones: three compact buttons side by side (icon over name); the picked one is outlined and bold. */}
      <div className="grid grid-cols-3 gap-2.5 md:grid-cols-[repeat(auto-fit,minmax(11.25rem,1fr))]">
        {TICKET_TYPES.map((t) => {
          const Icon = TYPE_ICON[t];
          return (
          <label
            key={t}
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-[0.625rem] border border-line p-4 text-sm transition-[border-color,background-color,transform] duration-200 active:scale-[0.99] has-focus-visible:ring-3 has-focus-visible:ring-acc/25 max-md:flex-col max-md:items-center max-md:gap-1.5 max-md:rounded-xl max-md:border-[0.125rem] max-md:px-1 max-md:py-3 max-md:text-center max-md:has-checked:font-semibold",
              typeStyle(t).choice,
              "md:hover:border-line md:hover:bg-row-hover md:has-checked:border-2 md:has-checked:border-acc md:has-checked:bg-acc-t2 md:has-checked:p-[0.9375rem]",
            )}
          >
            <input type="radio" name="type" value={t} checked={type === t} onChange={() => onType(t)} className="sr-only" />
            <TypeTile type={t} className="max-md:hidden" />
            <span className="min-w-0 max-md:contents">
              <span className="flex items-center gap-1.5 font-medium max-md:flex-col max-md:gap-1.5">
                <Icon className={cn("size-6 md:hidden", typeStyle(t).icon)} aria-hidden />
                {TYPE_LABELS[t]}
              </span>
              <span className="mt-0.5 block text-sm text-muted-foreground max-md:hidden">{TYPE_HINTS[t]}</span>
            </span>
          </label>
          );
        })}
      </div>
    </fieldset>
  );
}
