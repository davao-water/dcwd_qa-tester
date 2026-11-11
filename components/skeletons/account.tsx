import { Bone, Loading } from "./bones";
import { FormSkeleton } from "./form";

/** Account settings: the side tabs and one panel. */
export function AccountSkeleton() {
  return (
    <Loading className="gap-5">
      {/* The banner: photo, name and email. */}
      <div className="flex items-center gap-7 rounded-2xl border border-line p-[1.875rem] max-md:gap-3.5 max-md:p-5">
        <Bone className="size-[8.25rem] shrink-0 rounded-full max-md:size-20" />
        <div className="grid flex-1 gap-2.5">
          <Bone className="h-7 w-48" />
          <Bone className="h-4 w-64 max-w-full" />
        </div>
      </div>
      {/* The tabs along the top (laptops). */}
      <div className="hidden gap-6 border-b border-line pb-3 md:flex">
        {["4rem", "6.5rem", "3.5rem", "6rem"].map((w, i) => (
          <Bone key={i} className="h-5 rounded-md" width={w} />
        ))}
      </div>
      <FormSkeleton sections={1} />
    </Loading>
  );
}
