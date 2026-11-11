import { cn } from "@/lib/utils";
import { Bone, card, Loading } from "./bones";
import { HeaderSkeleton } from "./header";

/** Team & modules: the filter and module cards with people chips. */
export function TeamSkeleton() {
  return (
    <Loading>
      <HeaderSkeleton />
      <div className="flex flex-wrap items-start gap-6 desk:h-[calc(100dvh-18rem)] desk:flex-nowrap desk:items-stretch">
        <div className={cn(card, "grid min-w-0 flex-[1_1_17.5rem] content-start gap-3.5 p-4 desk:max-w-[22rem]")}>
          <Bone className="h-10 w-full" />
          <Bone className="h-3.5 w-28" />
          <Bone className="h-11 w-full" />
          {[0, 1, 2, 3, 4].map((i) => (
            <Bone key={i} className="h-9 w-full" />
          ))}
        </div>
        <div className={cn(card, "grid min-w-0 flex-[999_1_35rem] content-start gap-3 p-5")}>
          <Bone className="h-6 w-48" />
          <Bone className="h-4 w-28" />
          <Bone className="h-12 w-full rounded-lg" />
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex gap-3">
              <Bone className="h-5 w-1/4" />
              {[0, 1, 2].map((j) => (
                <Bone key={j} className="h-6 w-20 rounded-full" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </Loading>
  );
}
