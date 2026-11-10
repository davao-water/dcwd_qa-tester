"use client";

import { FormMessage } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { initialFormState } from "@/lib/form";
import { Trash2Icon, TriangleAlertIcon } from "lucide-react";
import { useActionState, useState } from "react";
import { deleteTicket } from "../../actions";
import { submitKeepingInput } from "@/components/submit-keeping-input";

/**
 * Permanent delete, the way GitHub deletes a repository: a red danger box spelling out what goes, and the button
 * stays disabled until the exact ticket title is typed.
 */
export function DeleteTicketDialog({
  ticket,
  replies,
  files,
  open: openProp,
  onOpenChange,
}: {
  ticket: { id: string; number: number; title: string };
  replies: number;
  files: number;
  /** Opened from the ⋯ More menu instead of its own button. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [openState, setOpenState] = useState(false);
  const controlled = openProp !== undefined;
  const open = openProp ?? openState;
  const setOpen = (next: boolean) =>
    onOpenChange ? onOpenChange(next) : setOpenState(next);
  const [typed, setTyped] = useState("");
  const [state, action, pending] = useActionState(
    deleteTicket,
    initialFormState,
  );
  const matches = typed.trim() === ticket.title;
  const plural = (n: number, one: string, many = `${one}s`) =>
    `${n} ${n === 1 ? one : many}`;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setTyped("");
      }}
    >
      {controlled ? null : (
        <DialogTrigger
          render={
            <Button variant="ghost-red" size="sm">
              Delete
            </Button>
          }
        />
      )}
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-bad">
            <TriangleAlertIcon className="size-5" aria-hidden /> Delete ticket #
            {ticket.number}?
          </DialogTitle>
          <DialogDescription>This can&apos;t be undone.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submitKeepingInput(action)} className="grid gap-4">
          <input type="hidden" name="id" value={ticket.id} />
          <div className="rounded-[0.625rem] border border-bad-b bg-bad-t px-4 py-3 text-[0.8438rem] leading-relaxed text-bad">
            <p className="font-semibold">
              This permanently deletes, for everyone:
            </p>
            <ul className="mt-1 list-disc pl-5">
              <li>the ticket and its description</li>
              <li>the conversation ({plural(replies, "reply", "replies")})</li>
              <li>the activity log</li>
              <li>
                {plural(files, "attached file")} (screenshots and videos) from
                the server
              </li>
            </ul>
          </div>
          <div className="grid gap-2">
            <label htmlFor="confirm-title" className="text-sm">
              To confirm, type the ticket&apos;s title exactly:
              <span className="mt-1.5 block rounded-md bg-surface3 px-2.5 py-1.5 font-mono text-[0.8125rem] font-semibold break-words select-all">
                {ticket.title}
              </span>
            </label>
            <Input
              id="confirm-title"
              name="confirm"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              autoFocus
              aria-invalid={!!state.message}
            />
          </div>
          <FormMessage state={state} />
          <div className="flex justify-end gap-2">
            <DialogClose render={<Button type="button" variant="outline" />}>
              Cancel
            </DialogClose>
            <Button
              type="submit"
              variant="destructive"
              disabled={!matches || pending}
            >
              <Trash2Icon /> {pending ? "Deleting…" : "Delete this ticket"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
