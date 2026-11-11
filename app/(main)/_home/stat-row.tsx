import Link from "next/link";
import { ArrowRightIcon, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type Stat = { label: string; value: number; href: string; icon: LucideIcon; note?: string; tone?: "warn" | "ok" };

const ICON_BOX = { warn: "bg-warn-t text-warn-ink", ok: "bg-ok-t text-ok" } as const;

/** The row of numbers at the top: swipeable cards on phones, a grid on laptops. */
export function StatRow({ stats }: { stats: Stat[] }) {
  return (
    <>
      {/* Phones: cards that swipe sideways, the first (the one to act on) in the accent colour. */}
      <div className="relative -mx-5 flex snap-x snap-mandatory scroll-px-5 gap-3 overflow-x-auto px-5 pb-1 [scrollbar-width:none] md:hidden">
        {stats.map(({ label, value, href, icon: Icon, note }, i) => (
          <Link
            key={label}
            href={href}
            className={cn(
              "grid w-[9.5rem] shrink-0 snap-start content-start gap-2.5 rounded-[1.125rem] p-4 outline-none focus-visible:ring-3 focus-visible:ring-acc/40 active:scale-[0.98]",
              i === 0
                ? "bg-acc text-primary-foreground shadow-[0_0.5rem_1.25rem_color-mix(in_srgb,var(--acc)_35%,transparent)]"
                : "bg-card shadow-[0_0.0625rem_0.125rem_rgba(20,22,40,0.06),0_0.125rem_0.5rem_rgba(20,22,40,0.04)]",
            )}
          >
            <span className={cn("flex size-8 items-center justify-center rounded-[0.5625rem]", i === 0 ? "bg-primary-foreground/20" : "bg-acc-t text-acc-ink")} aria-hidden>
              <Icon className="size-[1.125rem]" />
            </span>
            <span className="text-[1.875rem] leading-none font-bold tracking-[-0.03em] tabular-nums">{value}</span>
            <span className={cn("text-[0.8438rem] leading-snug font-medium", i === 0 ? "text-primary-foreground" : "text-ink2")}>
              {label}
              {note ? <span className="sr-only">, {note}</span> : null}
            </span>
          </Link>
        ))}
      </div>
      <div className="stagger grid grid-cols-[repeat(auto-fit,minmax(13.75rem,1fr))] gap-4 max-md:hidden">
        {stats.map(({ label, value, href, icon: Icon, note, tone }) => (
          <Link
            key={label}
            href={href}
            className="group flex items-center gap-4 rounded-[0.875rem] border border-line bg-card p-5 text-foreground shadow-(--shadow-card) transition-[border-color,box-shadow,transform] duration-200 ease-(--ease-out) hover:-translate-y-0.5 hover:border-acc-b hover:shadow-(--shadow-hover) focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none active:translate-y-0"
          >
            <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-[0.6875rem]", tone ? ICON_BOX[tone] : "bg-acc-t text-primary-text")} aria-hidden>
              <Icon className="size-[1.375rem]" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-muted-foreground">{label}</span>
              <span className="mt-0.5 flex items-baseline gap-x-2 truncate">
                <span className="text-[1.75rem] leading-tight font-semibold tracking-[-0.01em] tabular-nums">{value}</span>
                {note ? <span className="truncate text-[0.8125rem] text-muted-foreground">{note}</span> : null}
              </span>
            </span>
            <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-primary-text" aria-hidden />
          </Link>
        ))}
      </div>
    </>
  );
}
