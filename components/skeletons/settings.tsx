import { cn } from "@/lib/utils";
import { Bone, card, Loading } from "./bones";

/** Settings (phones): the photo card, then grouped rows, like a phone's own Settings app. */
export function SettingsSkeleton() {
  return (
    <Loading className="gap-5">
      <div className={cn(card, "flex items-center gap-3.5 p-4")}>
        <Bone className="size-14 shrink-0 rounded-full" />
        <div className="grid flex-1 gap-2">
          <Bone className="h-5 w-32" />
          <Bone className="h-3.5 w-48" />
        </div>
      </div>
      {[2, 4].map((rows, g) => (
        <div key={g} className={cn(card, "divide-y divide-line overflow-hidden")}>
          {Array.from({ length: rows }, (_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3.5">
              <Bone className="size-7 shrink-0 rounded-lg" />
              <Bone className="h-4 w-32" />
            </div>
          ))}
        </div>
      ))}
    </Loading>
  );
}
