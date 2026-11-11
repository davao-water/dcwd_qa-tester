import { cn } from "@/lib/utils";
import { Bone, card, Loading } from "./bones";
import { HeaderSkeleton } from "./header";
import { ListRows } from "./list-rows";

/** Dashboard: greeting, stat tiles, the ticket list beside the modules card, then Module progress. */
export function DashboardSkeleton() {
  return (
    <Loading className="gap-6">
      <HeaderSkeleton />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(13.75rem,1fr))] gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className={cn(card, "grid gap-3 p-5")}>
            <Bone className="h-3.5 w-24" />
            <Bone className="h-8 w-16" />
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-start gap-6">
        <div className="min-w-0 flex-[999_1_35rem]"><ListRows rows={5} /></div>
        <div className="min-w-0 flex-[1_1_20rem]"><ListRows rows={3} /></div>
      </div>
      <div className={cn(card, "grid gap-3 p-5")}>
        <Bone className="h-5 w-40" />
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(21.25rem,100%),1fr))] gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="grid gap-2.5 rounded-[0.625rem] border border-line p-3.5">
              <Bone className="h-4 w-32" />
              <Bone className="h-3 w-full" />
              <Bone className="h-3 w-full" />
              <Bone className="h-3 w-full" />
            </div>
          ))}
        </div>
      </div>
    </Loading>
  );
}
