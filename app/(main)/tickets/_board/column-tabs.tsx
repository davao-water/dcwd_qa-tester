"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { boardColumn, type BoardColumnKey } from "@/lib/tickets/board";
import { cn } from "@/lib/utils";
import type { BoardColumnData } from "./types";

/** Phones show one column at a time; these jump between them and show which one is in view. */
export function ColumnTabs({
  columns,
  board,
}: {
  columns: BoardColumnData[];
  board: RefObject<HTMLDivElement | null>;
}) {
  const [active, setActive] = useState<BoardColumnKey>(columns[0].key);
  const tabs = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = board.current;
    if (!el) return;
    const onScroll = () => {
      const pad = parseFloat(getComputedStyle(el).paddingLeft) || 0;
      let best: { key: BoardColumnKey; d: number } | null = null;
      for (const col of el.querySelectorAll<HTMLElement>(
        ":scope > [data-column]",
      )) {
        const d = Math.abs(col.offsetLeft - pad - el.scrollLeft);
        if (!best || d < best.d)
          best = { key: col.dataset.column as BoardColumnKey, d };
      }
      if (best) setActive(best.key);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [board]);

  // Keep the column in view's tab visible too (only when it's off the strip, so a tap never scrolls it).
  useEffect(() => {
    const strip = tabs.current;
    const tab = strip?.querySelector<HTMLElement>(`[data-column="${active}"]`);
    if (!strip || !tab) return;
    if (
      tab.offsetLeft < strip.scrollLeft ||
      tab.offsetLeft + tab.offsetWidth > strip.scrollLeft + strip.clientWidth
    ) {
      strip.scrollTo({ left: tab.offsetLeft - 20, behavior: "smooth" });
    }
  }, [active]);

  return (
    <nav
      ref={tabs}
      aria-label="Board columns"
      className="relative -mx-5 flex gap-2 overflow-x-auto px-5 [scrollbar-width:none] md:hidden"
    >
      {columns.map((c) => (
        <button
          key={c.key}
          type="button"
          data-column={c.key}
          aria-current={active === c.key ? "true" : undefined}
          onClick={() =>
            board.current
              ?.querySelector(`:scope > [data-column="${c.key}"]`)
              ?.scrollIntoView({
                behavior: "smooth",
                inline: "start",
                block: "nearest",
              })
          }
          className={cn(
            "flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium whitespace-nowrap outline-none focus-visible:ring-3 focus-visible:ring-acc/30",
            active === c.key
              ? "bg-foreground text-background"
              : "bg-card text-ink2 shadow-[0_0.0625rem_0.125rem_rgba(20,22,40,0.06),0_0.125rem_0.5rem_rgba(20,22,40,0.04)]",
          )}
        >
          {boardColumn(c.key).label}
          {c.inView || c.total ? (
            <span
              className={cn(
                "tabular-nums",
                active === c.key ? "opacity-70" : "text-muted-foreground",
              )}
            >
              {c.total}
            </span>
          ) : null}
        </button>
      ))}
    </nav>
  );
}
