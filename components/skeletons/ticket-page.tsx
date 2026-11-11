import { cn } from "@/lib/utils";
import { Bone, card, Loading } from "./bones";

/** One ticket: title and pills, the conversation, and the details panel beside it. */
export function TicketPageSkeleton() {
  return (
    <Loading>
      <div className="grid gap-3">
        <Bone className="h-4 w-24" />
        <Bone className="h-8 w-full max-w-xl" />
        <div className="flex gap-2">
          <Bone className="h-6 w-20 rounded-full" />
          <Bone className="h-6 w-24 rounded-full" />
          <Bone className="h-6 w-16 rounded-full" />
        </div>
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="grid gap-4">
          <div className={cn(card, "grid gap-2.5 p-5")}>
            <Bone className="h-4 w-full" />
            <Bone className="h-4 w-11/12" />
            <Bone className="h-4 w-3/4" />
            <Bone className="mt-2 h-40 w-full max-w-md rounded-[0.625rem]" />
          </div>
          {[0, 1, 2].map((i) => (
            <div key={i} className={cn("flex gap-3", i === 1 && "flex-row-reverse")}>
              <Bone className="size-8 shrink-0 rounded-full" />
              <div className={cn(card, "grid w-full max-w-lg gap-2 p-4")}>
                <Bone className="h-3.5 w-28" />
                <Bone className="h-4 w-full" />
                <Bone className="h-4 w-2/3" />
              </div>
            </div>
          ))}
        </div>
        <div className={cn(card, "grid gap-4 p-5")}>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="grid gap-1.5">
              <Bone className="h-3 w-20" />
              <Bone className="h-5 w-36" />
            </div>
          ))}
        </div>
      </div>
    </Loading>
  );
}
