import Link from "next/link";
import { TicketIcon } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import type { Role } from "@/lib/auth/permissions";
import { NewTicketButton } from "./new-ticket-buttons";

/** What the list says when it has no tickets: "No open tickets" on a plain view, "Nothing matches" otherwise. */
export function EmptyList({
  plainView,
  filtered,
  narrowed,
  canFile,
  clearHref,
  role,
}: {
  /** No filters, the Open tab, no person or status picked, and nothing at all to show. */
  plainView: boolean;
  filtered: boolean;
  /** Filtered, or a status or person is picked by the tab. */
  narrowed: boolean;
  canFile: boolean;
  clearHref: string;
  role: Role;
}) {
  return (
    <EmptyState
      icon={TicketIcon}
      title={plainView ? "No open tickets" : "Nothing matches"}
      action={
        filtered ? (
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href={clearHref} />}
          >
            Clear the filters
          </Button>
        ) : canFile ? (
          <NewTicketButton />
        ) : null
      }
    >
      {narrowed
        ? "Try another view or clear the filters."
        : role === "DEV"
          ? "Nothing is assigned to you right now. Tickets appear here when a QA tester assigns them to you."
          : "File the first one: a bug, a suggestion or an improvement."}
    </EmptyState>
  );
}
