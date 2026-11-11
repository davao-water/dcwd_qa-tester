import { cn } from "@/lib/utils";
import { Bone, card, Loading } from "./bones";

/** A form page in a card: `sections` groups of fields. */
export function FormSkeleton({ sections = 2 }: { sections?: number }) {
  return (
    <Loading className={cn(card, "gap-6 p-6")}>
      {Array.from({ length: sections }, (_, i) => (
        <div key={i} className="grid gap-4">
          <Bone className="h-3.5 w-28" />
          <div className="grid gap-4 md:grid-cols-2">
            {[0, 1].map((j) => (
              <div key={j} className="grid gap-2">
                <Bone className="h-3.5 w-24" />
                <Bone className="h-11 w-full rounded-[0.5625rem]" />
              </div>
            ))}
          </div>
        </div>
      ))}
      <Bone className="h-10 w-32 justify-self-end rounded-[0.5625rem]" />
    </Loading>
  );
}
