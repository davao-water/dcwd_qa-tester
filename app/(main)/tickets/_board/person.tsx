import { UserRoundIcon } from "lucide-react";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { BoardCard } from "./types";

/** The round initials badge for the developer (or who filed it); a dashed outline when nobody is assigned. */
export function Person({ person }: { person: BoardCard["person"] }) {
  const label = `${person.role}: ${person.name ?? "not assigned"}`;
  return (
    <span
      title={label}
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-full text-[0.625rem] font-semibold",
        person.name
          ? "bg-acc-t text-acc-ink"
          : "border border-dashed border-line text-muted-foreground",
      )}
    >
      {person.name ? (
        <span aria-hidden>{initials(person.name)}</span>
      ) : (
        <UserRoundIcon className="size-3.5" aria-hidden />
      )}
      <span className="sr-only">{label}</span>
    </span>
  );
}
