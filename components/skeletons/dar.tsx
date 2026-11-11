import { cn } from "@/lib/utils";
import { Bone, card, Loading } from "./bones";
import { HeaderSkeleton } from "./header";

/** My DAR: the toolbar and the report sheet. */
export function DarSkeleton() {
  return (
    <Loading>
      <HeaderSkeleton />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Bone className="h-11 w-72" />
        <div className="flex gap-2">
          {["7rem", "9rem", "5rem", "5rem", "6rem"].map((w, i) => (
            <Bone key={i} className="h-9" width={w} />
          ))}
        </div>
      </div>
      <div className={cn(card, "grid gap-3 p-5")}>
        <Bone className="mx-auto h-5 w-72" />
        <Bone className="mx-auto h-4 w-56" />
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <Bone key={i} className="h-5 w-full max-w-sm" />
          ))}
        </div>
        <div className="mt-3 grid grid-cols-[2fr_2fr_repeat(8,1fr)] gap-1">
          {Array.from({ length: 40 }, (_, i) => (
            <Bone key={i} className="h-10 rounded-sm" />
          ))}
        </div>
      </div>
    </Loading>
  );
}
