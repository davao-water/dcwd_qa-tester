import { cn } from "@/lib/utils";
import { Bone, card, Loading } from "./bones";

/** My inbox: the conversation list beside an empty conversation pane (the list alone on phones). */
export function InboxSkeleton() {
  return (
    <Loading className="desk:min-h-0 desk:flex-1">
      <div className={cn(card, "grid overflow-hidden lg:h-[calc(100dvh-17.5rem)] lg:min-h-130 lg:grid-cols-[minmax(18.75rem,23.75rem)_minmax(0,1fr)] desk:h-full!")}>
        <div className="flex flex-col border-line lg:border-r">
          <div className="grid gap-2.5 border-b border-line2 px-4 py-3.5">
            <Bone className="h-10 w-full" />
            <Bone className="h-9 w-full rounded-[0.625rem]" />
          </div>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="grid gap-1.5 border-b border-line2 px-4 py-3">
              <div className="flex justify-between">
                <Bone className="h-3 w-12" />
                <Bone className="h-3 w-8" />
              </div>
              <Bone className={cn("h-4", i % 2 ? "w-4/5" : "w-3/5")} />
              <Bone className="h-3 w-full" />
            </div>
          ))}
        </div>
        <div className="hidden bg-surface2 lg:block" />
      </div>
    </Loading>
  );
}
