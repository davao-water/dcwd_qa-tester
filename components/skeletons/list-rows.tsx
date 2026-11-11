import { cn } from "@/lib/utils";
import { Bone, card } from "./bones";

/** Ticket-shaped rows in a card: used by the tickets list and the dashboard. */
export function ListRows({ rows }: { rows: number }) {
  return (
    <div className={cn(card, "divide-y divide-line overflow-hidden")}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 border-l-[0.1875rem] border-l-line px-4 py-3.5">
          <Bone className="h-4 w-10 shrink-0" />
          <div className="grid min-w-0 flex-1 gap-2">
            <Bone className={cn("h-4", i % 3 === 0 ? "w-3/5" : i % 3 === 1 ? "w-4/5" : "w-2/3")} />
            <div className="flex gap-2">
              <Bone className="h-5 w-20 rounded-full" />
              <Bone className="h-5 w-24" />
            </div>
          </div>
          <Bone className="hidden h-6 w-24 rounded-full sm:block" />
          <Bone className="hidden size-7 rounded-full md:block" />
        </div>
      ))}
    </div>
  );
}
