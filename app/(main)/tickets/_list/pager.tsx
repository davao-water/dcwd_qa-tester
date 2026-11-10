import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TicketFilters } from "@/lib/schemas/ticket";
import { pageList } from "@/lib/tickets/pager";
import { cn } from "@/lib/utils";
import { hrefWith } from "./href";

/** "{n} tickets" and the numbered pages (‹ 1 … 4 5 6 … 12 ›). The numbers are hidden when everything fits on one page. */
export function Pager({
  f,
  total,
  pages,
}: {
  f: TicketFilters;
  total: number;
  pages: number;
}) {
  const page = Math.min(f.page, pages);
  const box =
    "flex size-9 items-center justify-center rounded-lg border border-line text-sm font-medium tabular-nums transition-colors";
  return (
    <div className="flex min-h-15 flex-wrap items-center justify-between gap-3 pt-3 text-[0.8125rem] text-muted-foreground">
      <span>
        {total} ticket{total === 1 ? "" : "s"}
      </span>
      {/* Phones keep Previous and Next (D1): numbered pages don't fit a narrow screen. */}
      {pages > 1 ? (
        <span className="flex items-center gap-1.5 md:hidden">
          <span className="mr-1">
            Page {page} of {pages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            nativeButton={false}
            render={
              <Link
                href={hrefWith(f, { page: page - 1 })}
                aria-disabled={page <= 1}
              />
            }
          >
            <ChevronLeftIcon /> Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= pages}
            nativeButton={false}
            render={
              <Link
                href={hrefWith(f, { page: page + 1 })}
                aria-disabled={page >= pages}
              />
            }
          >
            Next <ChevronRightIcon />
          </Button>
        </span>
      ) : null}
      {pages > 1 ? (
        <nav
          aria-label="Pages"
          className="flex items-center gap-1.5 max-md:hidden"
        >
          {page > 1 ? (
            <Link
              href={hrefWith(f, { page: page - 1 })}
              aria-label="Previous page"
              className={cn(box, "text-foreground hover:bg-row-hover")}
            >
              <ChevronLeftIcon className="size-4" aria-hidden />
            </Link>
          ) : (
            <span aria-hidden className={cn(box, "opacity-40")}>
              <ChevronLeftIcon className="size-4" />
            </span>
          )}
          {pageList(page, pages).map((n, i) =>
            n === "gap" ? (
              <span key={`gap-${i}`} aria-hidden className="w-6 text-center">
                …
              </span>
            ) : (
              <Link
                key={n}
                href={hrefWith(f, { page: n })}
                aria-current={n === page ? "page" : undefined}
                aria-label={`Page ${n}`}
                className={cn(
                  box,
                  n === page
                    ? "border-acc bg-acc text-primary-foreground"
                    : "text-foreground hover:bg-row-hover",
                )}
              >
                {n}
              </Link>
            ),
          )}
          {page < pages ? (
            <Link
              href={hrefWith(f, { page: page + 1 })}
              aria-label="Next page"
              className={cn(box, "text-foreground hover:bg-row-hover")}
            >
              <ChevronRightIcon className="size-4" aria-hidden />
            </Link>
          ) : (
            <span aria-hidden className={cn(box, "opacity-40")}>
              <ChevronRightIcon className="size-4" />
            </span>
          )}
        </nav>
      ) : null}
    </div>
  );
}
