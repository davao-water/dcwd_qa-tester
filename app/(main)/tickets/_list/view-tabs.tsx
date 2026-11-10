import Link from "next/link";
import type { TicketFilters } from "@/lib/schemas/ticket";
import { cn } from "@/lib/utils";
import { hrefWith } from "./href";
import type { Quick } from "./quick-views";

/** The views. Phones: chips that scroll sideways. Laptops: underline tabs with a count, as on the board. */
export function ViewTabs({ f, views, counts }: { f: TicketFilters; views: Quick[]; counts: number[] }) {
  const isQuick = (p: Quick["patch"]) =>
    f.group === p.group &&
    f.status === p.status &&
    f.assignee === p.assignee &&
    f.reporter === p.reporter;
  return (
    <nav
      aria-label="Ticket views"
      className="flex gap-1.5 max-md:-mx-5 max-md:gap-2 max-md:overflow-x-auto max-md:px-5 max-md:[scrollbar-width:none] md:gap-1 md:overflow-x-auto md:overflow-y-hidden md:border-b md:border-line"
    >
      {views.map((v, i) => {
        const on = isQuick(v.patch);
        return (
          <Link
            key={v.label}
            href={hrefWith(f, v.patch)}
            aria-current={on ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-2 font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
              // Phones
              "max-md:h-9 max-md:rounded-full max-md:px-4 max-md:text-sm",
              on
                ? "max-md:bg-acc max-md:text-primary-foreground"
                : "max-md:bg-card max-md:text-ink2 max-md:shadow-[0_0.0625rem_0.125rem_rgba(20,22,40,0.06),0_0.125rem_0.5rem_rgba(20,22,40,0.04)]",
              // Laptops
              "md:h-12 md:border-b-2 md:px-4 md:text-[0.9375rem] md:focus-visible:ring-inset",
              on
                ? "md:border-acc md:text-primary-text"
                : "md:border-transparent md:text-muted-foreground md:hover:bg-row-hover md:hover:text-foreground",
            )}
          >
            {v.label}
            <span
              className={cn(
                "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 font-mono text-[0.75rem] tabular-nums max-md:hidden",
                on ? "bg-acc-t text-acc-ink" : "bg-surface3 text-ink2",
              )}
            >
              {counts[i]}
              <span className="sr-only"> tickets</span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
