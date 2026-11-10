import Link from "next/link";
import { FileBarChartIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/** The printable module report (Print or Save as PDF), in a new tab. */
export function ReportButton() {
  return (
    <Button variant="outline" nativeButton={false} render={<a href="/tickets/report" target="_blank" rel="noopener" />}>
      <FileBarChartIcon /> <span className="max-sm:sr-only">Module report</span>
    </Button>
  );
}

export function NewTicketButton() {
  return (
    <Button nativeButton={false} render={<Link href="/tickets/new" />}>
      <PlusIcon /> New ticket
    </Button>
  );
}

/** Phones: New ticket floats above the tab bar, in thumb reach. */
export function NewTicketFab() {
  return (
    <Link
      href="/tickets/new"
      className="fixed right-5 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-20 flex h-14 items-center gap-2 rounded-[1.125rem] bg-acc pr-5 pl-4 text-[0.9375rem] font-semibold text-primary-foreground shadow-[0_0.625rem_1.5rem_color-mix(in_srgb,var(--acc)_40%,transparent)] outline-none focus-visible:ring-3 focus-visible:ring-acc/40 active:scale-95 md:hidden"
    >
      <PlusIcon className="size-5" aria-hidden /> New ticket
    </Link>
  );
}
