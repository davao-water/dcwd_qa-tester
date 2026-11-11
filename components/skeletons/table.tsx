import { cn } from "@/lib/utils";
import { Bone, card, Loading } from "./bones";
import { HeaderSkeleton } from "./header";

/** Admin tables (users): a toolbar and rows. */
export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <Loading>
      <HeaderSkeleton />
      <div className={cn(card, "divide-y divide-line overflow-hidden")}>
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3.5">
            <Bone className="size-8 shrink-0 rounded-full" />
            <div className="grid flex-1 gap-1.5">
              <Bone className="h-4 w-40" />
              <Bone className="h-3.5 w-56" />
            </div>
            <Bone className="h-6 w-20 rounded-full" />
            <Bone className="h-8 w-8" />
          </div>
        ))}
      </div>
    </Loading>
  );
}
