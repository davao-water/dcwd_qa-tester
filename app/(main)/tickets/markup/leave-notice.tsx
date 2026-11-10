import { Button } from "@/components/ui/button";

/** "Leave?" under the screenshot, after the corner X, when leaving would lose something. */
export function LeaveNotice({ isEdit, onStay, onLeave }: { isEdit: boolean; onStay: () => void; onLeave: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warn-b bg-warn-t px-3.5 py-2.5 text-sm text-foreground max-md:order-3 max-md:shrink-0 max-md:short:col-start-2 max-md:short:row-start-3">
      <span className="min-w-0 flex-1">
        {isEdit ? "Leave? Your new marks won't be saved, and the image stays as it was." : "Leave? This screenshot won't be added."}
      </span>
      <span className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onStay} autoFocus>
          Keep editing
        </Button>
        <Button type="button" variant="destructive" size="sm" onClick={onLeave}>
          Leave
        </Button>
      </span>
    </div>
  );
}
