import { cn } from "@/lib/utils";
import { Bone, card, Loading } from "./bones";
import { HeaderSkeleton } from "./header";
import { ListRows } from "./list-rows";

/** Tickets list: the view tabs, the filter card and rows (chips and cards on phones). */
export function TicketListSkeleton({ rows = 8, header = false }: { rows?: number; header?: boolean }) {
  return (
    <Loading>
      {header ? <HeaderSkeleton /> : null}
      <div className="flex flex-wrap gap-2 md:gap-6 md:border-b md:border-line md:pb-3">
        {["7rem", "6rem", "9rem", "4rem", "3.5rem"].map((w, i) => (
          <Bone key={i} className="h-8 rounded-full md:h-5 md:rounded-md" width={w} />
        ))}
      </div>
      <div className={cn(card, "flex flex-wrap items-end gap-2.5 p-4 max-md:hidden")}>
        {["flex-[2_1_17.5rem]", "flex-[1_1_9.5rem]", "flex-[1_1_12rem]", "flex-[1_1_10rem]"].map((c, i) => (
          <div key={i} className={cn("grid min-w-0 gap-2", c)}>
            <Bone className="h-3.5 w-16" />
            <Bone className="h-11 w-full rounded-[0.5625rem]" />
          </div>
        ))}
      </div>
      <ListRows rows={rows} />
    </Loading>
  );
}
