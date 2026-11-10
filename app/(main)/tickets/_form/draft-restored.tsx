import { InlineAlert } from "@/components/inline-alert";
import { Button } from "@/components/ui/button";

/** "Draft restored", with Clear to start the form over. */
export function DraftRestored({ onClear }: { onClear: () => void }) {
  return (
    <InlineAlert tone="info" role="status">
      <div className="grid justify-items-start gap-2">
        <span>Draft restored. Files that hadn&apos;t finished uploading need adding again.</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onClear}
        >
          Clear
        </Button>
      </div>
    </InlineAlert>
  );
}
