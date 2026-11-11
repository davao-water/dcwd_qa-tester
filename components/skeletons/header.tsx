import { Bone } from "./bones";

/** A page title and description, for pages whose header waits for the session. */
export function HeaderSkeleton() {
  return (
    <div className="grid gap-2.5 pb-2">
      <Bone className="h-7 w-48" />
      <Bone className="h-4 w-full max-w-md" />
    </div>
  );
}
