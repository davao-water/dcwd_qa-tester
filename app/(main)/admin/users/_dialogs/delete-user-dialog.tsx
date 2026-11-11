"use client";

import { useActionState, useState } from "react";
import { Trash2Icon, TriangleAlertIcon } from "lucide-react";
import { FormMessage } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatBytes } from "@/lib/format";
import { initialFormState, type FormState } from "@/lib/form";
import type { DeletionPreview } from "@/lib/users/delete";
import { deleteUser, deletionPreview } from "../actions";

/**
 * Deletes an account and everything it made, like DeleteTicketDialog: a red box spelling out what goes (counted when
 * the dialog opens), and the button stays disabled until the account's email is typed exactly.
 */
export function DeleteUserDialog({ user }: { user: { id: string; name: string; email: string } }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [preview, setPreview] = useState<DeletionPreview | null>(null);
  const [state, action, pending] = useActionState(async (prev: FormState, fd: FormData) => {
    const r = await deleteUser(prev, fd);
    if (r.ok) setOpen(false);
    return r;
  }, initialFormState);
  const matches = typed.trim().toLowerCase() === user.email;
  const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) deletionPreview(user.id).then(setPreview, () => setPreview(null));
        else {
          setTyped("");
          setPreview(null);
        }
      }}
    >
      <DialogTrigger
        render={
          <Button variant="ghost" size="icon-sm" className="text-bad hover:bg-bad-t hover:text-bad" aria-label={`Delete ${user.name}`} title="Delete user">
            <Trash2Icon />
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-bad">
            <TriangleAlertIcon className="size-5" aria-hidden /> Delete {user.name} and everything they made?
          </DialogTitle>
          <DialogDescription>This can&apos;t be undone. To keep their history, edit the account and untick <em>Account is active</em> instead.</DialogDescription>
        </DialogHeader>
        <form action={action} className="grid gap-4">
          <input type="hidden" name="id" value={user.id} />
          <div className="rounded-[10px] border border-bad-b bg-bad-t px-4 py-3 text-[13.5px] leading-relaxed text-bad">
            <p className="font-semibold">This permanently deletes, for everyone:</p>
            {preview ? (
              <ul className="mt-1 list-disc pl-5">
                <li>
                  {plural(preview.tickets, "ticket")} they filed, with everything on them
                  {preview.othersReplies ? `, including ${plural(preview.othersReplies, "reply", "replies")} from other people` : ""}
                </li>
                <li>{plural(preview.replies, "reply", "replies")} they wrote, and their entries in ticket timelines</li>
                <li>
                  {plural(preview.files, "file")} ({formatBytes(preview.bytes)}) from the server
                </li>
                <li>their account, DAR, devices and module memberships</li>
              </ul>
            ) : (
              <p className="mt-1">Counting what they made…</p>
            )}
            <p className="mt-2">Tickets assigned to them stay, unassigned.</p>
          </div>
          <div className="grid gap-2">
            <label htmlFor={`confirm-${user.id}`} className="text-sm">
              To confirm, type their email exactly:
              <span className="mt-1.5 block rounded-md bg-surface3 px-2.5 py-1.5 font-mono text-[0.8125rem] font-semibold break-words select-all">{user.email}</span>
            </label>
            <Input id={`confirm-${user.id}`} name="confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} autoFocus aria-invalid={!!state.message} />
          </div>
          <FormMessage state={state} />
          <div className="flex justify-end gap-2">
            <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
            <Button type="submit" variant="destructive" disabled={!matches || !preview || pending}>
              <Trash2Icon /> {pending ? "Deleting…" : "Delete account and everything"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
