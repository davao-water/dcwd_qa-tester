"use client";

import { startTransition, useActionState, useCallback, useState } from "react";
import { Menu } from "@base-ui/react/menu";
import {
  ArrowRightLeftIcon,
  ChevronDownIcon,
  EllipsisIcon,
  PencilIcon,
  SendIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from "lucide-react";
import { useCloseGuard } from "@/components/close-guard";
import { Field, FormMessage } from "@/components/form-field";
import { FormDialog } from "@/components/form-dialog";
import { SelectField } from "@/components/select-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useTouchScreen } from "@/hooks/use-touch-screen";
import { initialFormState, type FormState } from "@/lib/form";
import { isRedMove, moveLayout } from "@/lib/tickets/moves";
import { cn } from "@/lib/utils";
import {
  CATEGORY_LABELS,
  NO_CATEGORY,
  STATUS_LABELS,
  TICKET_CATEGORIES,
  type TicketCategoryValue,
  type TicketStatus,
  type Transition,
} from "@/lib/tickets/workflow";
import {
  addComment,
  assignTicket,
  categorizeTicket,
  deleteTicket,
  handBackTicket,
  moveTicket,
} from "../actions";
import { AttachMenu } from "../attach-menu";
import { ImagePicker, useImageAttachments } from "../image-picker";
import { useVideoUpload, VideoPicker } from "../video-picker";
import {
  AssigneeSelect,
  submitKeepingInput,
  TicketForm,
  type AreaOption,
  type AssigneeOption,
  type TicketValues,
} from "../ticket-form";

type Ref = { id: string; number: number };

/**
 * The ticket's moves for this person (lib/tickets/moves.ts): their next step as the main button, at most one equally
 * common second button (Reopen while retesting), and everything else in a "More" menu, other outcomes first, then
 * moves that undo a mistake. Each opens a short dialog for the note.
 */
export function StatusMoves({
  ticket,
  status,
  moves,
  handBack,
}: {
  ticket: Ref;
  status: TicketStatus;
  moves: Transition[];
  /** Developers to recommend when Won't fix hands the ticket back; null when this person can't hand it back. */
  handBack?: { developers: { id: string; name: string }[] } | null;
}) {
  const [picked, setPicked] = useState<Transition | null>(null);
  if (!moves.length) return null;
  const { main, second, outcomes, undo } = moveLayout(moves);
  const description = (m: Transition) =>
    `${STATUS_LABELS[status]} → ${STATUS_LABELS[m.to]}`;
  const button = (m: Transition, primary: boolean) => (
    <FormDialog
      key={m.to}
      title={m.label}
      description={description(m)}
      trigger={
        <Button
          variant={primary ? "default" : isRedMove(m) ? "ghost-red" : "outline"}
        >
          {m.label}
        </Button>
      }
    >
      {(close) => <MoveForm ticket={ticket} move={m} reasons={moves.filter((x) => x.within === m.to)} handBack={handBack} onDone={close} />}
    </FormDialog>
  );
  const item =
    "flex w-full cursor-pointer items-center rounded-lg px-3 py-2 text-sm outline-none data-highlighted:bg-row-hover";
  const group =
    "px-3 pt-1.5 pb-1 text-[0.75rem] font-semibold tracking-[0.04em] text-muted-foreground uppercase";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {outcomes.length || undo.length ? (
        <Menu.Root>
          <Menu.Trigger
            render={
              <Button
                type="button"
                variant="outline"
                className="data-popup-open:bg-acc-t2"
              />
            }
          >
            {main || second ? "More" : "Moves"} <ChevronDownIcon aria-hidden />
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner
              side="bottom"
              align="end"
              sideOffset={6}
              className="isolate z-50"
            >
              <Menu.Popup className="w-56 origin-(--transform-origin) rounded-xl bg-popover p-1.5 text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-150 ease-(--ease-out) data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
                {outcomes.length ? (
                  <Menu.Group>
                    <Menu.GroupLabel className={group}>
                      Other outcomes
                    </Menu.GroupLabel>
                    {outcomes.map((m) => (
                      <Menu.Item
                        key={m.to}
                        className={cn(
                          item,
                          isRedMove(m) &&
                            "text-destructive-text data-highlighted:bg-bad-w",
                        )}
                        onClick={() => setPicked(m)}
                      >
                        {m.label}
                      </Menu.Item>
                    ))}
                  </Menu.Group>
                ) : null}
                {outcomes.length && undo.length ? (
                  <Menu.Separator className="-mx-1.5 my-1 h-px bg-line2" />
                ) : null}
                {undo.length ? (
                  <Menu.Group>
                    <Menu.GroupLabel className={group}>
                      Undo a mistake
                    </Menu.GroupLabel>
                    {undo.map((m) => (
                      <Menu.Item
                        key={m.to}
                        className={item}
                        onClick={() => setPicked(m)}
                      >
                        {m.label}
                      </Menu.Item>
                    ))}
                  </Menu.Group>
                ) : null}
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      ) : null}
      {second ? button(second, false) : null}
      {main ? button(main, true) : null}
      {/* A move picked from the menu opens the same dialog as a button would. */}
      <FormDialog
        title={picked?.label ?? ""}
        description={picked ? description(picked) : undefined}
        open={!!picked}
        onOpenChange={(o) => !o && setPicked(null)}
      >
        {(close) =>
          picked ? (
            <MoveForm ticket={ticket} move={picked} reasons={moves.filter((x) => x.within === picked.to)} handBack={handBack} onDone={close} />
          ) : null
        }
      </FormDialog>
    </div>
  );
}

const NOTE_HINTS: Partial<Record<TicketStatus, string>> = {
  NEED_INFO: "What do you need from QA? They'll see this in the thread.",
  FIXED:
    "Optional: what changed and in which build, so QA knows what to retest.",
  REOPENED: "What is still wrong? Add a screenshot in a comment if it helps.",
  REJECTED: "Why this isn't a bug, e.g. it works as the business rule says.",
  WONT_FIX: "Why it can't be fixed.",
};

/** The reasons Won't fix asks for: each ends the ticket differently, or hands it back to QA. */
const HANDBACK = "HANDBACK";
const REASON_LABELS: Partial<Record<TicketStatus, string>> = {
  WONT_FIX: "It can't be fixed",
  REJECTED: "It isn't a bug (it works as designed)",
};

/**
 * One status move with its note (and the duplicate's number). Also the dialog for a card dropped on the board. Won't fix
 * first asks why: it can't be fixed, it isn't a bug (`reasons`: Not a bug), or another developer should take it
 * (`handBack`: back to QA unassigned, with who they recommend).
 */
export function MoveForm({
  ticket,
  move,
  reasons = [],
  handBack,
  onDone,
}: {
  ticket: Ref;
  move: Transition;
  reasons?: Transition[];
  handBack?: { developers: { id: string; name: string }[] } | null;
  onDone: () => void;
}) {
  const choices = [move, ...reasons];
  const asks = choices.length > 1 || !!handBack;
  const [reason, setReason] = useState<string>(move.to);
  const chosen = choices.find((c) => c.to === reason) ?? move;
  const handingBack = reason === HANDBACK;
  const [state, action, pending] = useActionState(
    async (prev: FormState, fd: FormData) => {
      const r = fd.get("reason") === HANDBACK ? await handBackTicket(prev, fd) : await moveTicket(prev, fd);
      if (r.ok) onDone();
      return r;
    },
    initialFormState,
  );
  const err = state.fieldErrors ?? {};
  return (
    <form onSubmit={submitKeepingInput(action)} className="grid gap-4">
      <input type="hidden" name="id" value={ticket.id} />
      <input type="hidden" name="number" value={ticket.number} />
      <input type="hidden" name="reason" value={reason} />
      {handingBack ? null : <input type="hidden" name="to" value={chosen.to} />}
      {asks ? (
        <fieldset className="grid gap-2">
          <legend className="mb-1.5 text-sm font-medium">Why?</legend>
          {[...choices.map((c) => ({ value: c.to as string, label: REASON_LABELS[c.to] ?? c.label })), ...(handBack ? [{ value: HANDBACK, label: "Another developer should take it" }] : [])].map((o) => (
            <label
              key={o.value}
              className="flex cursor-pointer items-center gap-2.5 rounded-[0.625rem] border border-line px-3 py-2.5 text-sm transition-colors has-checked:border-acc has-checked:bg-acc-t2"
            >
              <input type="radio" name="reason-pick" checked={reason === o.value} onChange={() => setReason(o.value)} />
              {o.label}
            </label>
          ))}
        </fieldset>
      ) : null}
      {handingBack && handBack ? (
        <Field
          label="Recommend a developer"
          htmlFor="recommendId"
          hint="Optional. The ticket goes back to the QA tester, unassigned, with your recommendation; they assign it."
        >
          <SelectField
            id="recommendId"
            name="recommendId"
            defaultValue=""
            options={[{ value: "", label: "— Let QA pick —" }, ...handBack.developers.map((d) => ({ value: d.id, label: d.name }))]}
          />
        </Field>
      ) : null}
      {move.needsDuplicate ? (
        <Field
          label="Duplicate of ticket #"
          htmlFor="duplicateOf"
          error={err.duplicateOf}
          required
        >
          <Input
            id="duplicateOf"
            name="duplicateOf"
            inputMode="numeric"
            required
            placeholder="e.g. 12"
            className="w-32 font-mono"
          />
        </Field>
      ) : null}
      <Field
        label="Note"
        htmlFor="note"
        error={err.note}
        required={handingBack || chosen.needsNote}
        hint={
          handingBack
            ? "Why another developer should take it, e.g. it's in the payroll code Cy owns."
            : (chosen.hint ?? NOTE_HINTS[chosen.to] ?? (chosen.needsNote ? undefined : "Optional."))
        }
      >
        <Textarea
          id="note"
          name="note"
          rows={3}
          maxLength={5000}
          required={handingBack || chosen.needsNote}
          autoFocus
        />
      </Field>
      <FormMessage state={state} />
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : handingBack ? "Hand back to QA" : asks ? chosen.label : move.label}
        </Button>
      </div>
    </form>
  );
}

/**
 * The Developer box in a ticket's details. With a developer set it shows their name and **Reassign**, which opens the
 * picker and an optional reason for the timeline; with none, the picker shows straight away with **Assign**.
 */
export function AssignControl({
  ticket,
  areas,
  people,
  areaId,
  assigneeId,
  assigneeName,
}: {
  ticket: Ref;
  areas: AreaOption[];
  people: AssigneeOption[];
  areaId: string;
  assigneeId: string;
  assigneeName: string | null;
}) {
  const [open, setOpen] = useState(!assigneeId);

  if (!open) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">{assigneeName ?? "Not assigned"}</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setOpen(true)}
        >
          <ArrowRightLeftIcon /> Reassign
        </Button>
      </div>
    );
  }
  const close = () => setOpen(false);
  return (
    <AssignForm
      ticket={ticket}
      areas={areas}
      people={people}
      areaId={areaId}
      assigneeId={assigneeId}
      onDone={close}
      onCancel={assigneeId ? close : undefined}
    />
  );
}

/** The Category row for those allowed to change it (canCategorize). A choice saves straight away, with a line in the activity log. */
export function CategoryControl({
  ticket,
  category,
}: {
  ticket: Ref;
  category: TicketCategoryValue | null;
}) {
  const [state, action, pending] = useActionState(
    categorizeTicket,
    initialFormState,
  );
  const options = TICKET_CATEGORIES.map((c) => ({
    value: c,
    label: CATEGORY_LABELS[c],
  }));
  return (
    <div className="grid justify-items-start gap-1.5">
      <SelectField
        key={category ?? "none"}
        aria-label="Category"
        size="sm"
        className="w-full max-w-[12rem]"
        disabled={pending}
        defaultValue={category ?? ""}
        options={
          category ? options : [{ value: "", label: NO_CATEGORY }, ...options]
        }
        onValueChange={(next) => {
          if (!next) return;
          const fd = new FormData();
          fd.set("id", ticket.id);
          fd.set("number", String(ticket.number));
          fd.set("category", next);
          startTransition(() => action(fd));
        }}
      />
      <FormMessage state={state} />
    </div>
  );
}

/** The developer picker, with an optional reason when reassigning. Also the board's Assign dialog. */
export function AssignForm({
  ticket,
  areas,
  people,
  areaId,
  assigneeId,
  onDone,
  onCancel,
}: {
  ticket: Ref;
  areas: AreaOption[];
  people: AssigneeOption[];
  areaId: string;
  assigneeId: string;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const [chosen, setChosen] = useState(assigneeId);
  const [state, action, pending] = useActionState(
    async (prev: FormState, fd: FormData) => {
      const r = await assignTicket(prev, fd);
      if (r.ok) onDone();
      return r;
    },
    initialFormState,
  );

  const changed = chosen !== assigneeId;
  return (
    <form
      onSubmit={submitKeepingInput(action)}
      className="panel-in grid gap-2.5"
    >
      <input type="hidden" name="id" value={ticket.id} />
      <input type="hidden" name="number" value={ticket.number} />
      <AssigneeSelect
        areas={areas}
        people={people}
        areaId={areaId}
        defaultValue={assigneeId}
        id="assign"
        onValueChange={setChosen}
      />
      {assigneeId ? (
        <Textarea
          name="note"
          rows={2}
          maxLength={500}
          placeholder="Reason (optional), e.g. Ben is on leave"
          aria-label="Reason for reassigning"
          className="min-h-0 text-[0.875rem]"
        />
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={pending || !changed}>
          {pending ? "Saving…" : assigneeId ? "Save" : "Assign"}
        </Button>
        {onCancel ? (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
      <FormMessage state={state} />
    </form>
  );
}

/** `replyTo`: on the ticket page, the other person's name (or "" if there is none yet), for a visible label and the fuller buttons. */
export function CommentForm({
  ticket,
  replyTo,
}: {
  ticket: Ref;
  replyTo?: string;
}) {
  const full = replyTo !== undefined;
  const asking = replyTo ? `Write a reply to ${replyTo}` : "Write a reply";
  const images = useImageAttachments();
  const video = useVideoUpload();
  const touch = useTouchScreen();
  const [body, setBody] = useState("");
  const [state, action, pending] = useActionState(
    async (prev: FormState, fd: FormData) => {
      const r = await addComment(prev, fd);
      if (r.ok) {
        setBody("");
        images.clear();
        video.clear();
      }
      return r;
    },
    initialFormState,
  );
  const busy = pending || video.busy || images.busy;
  const canSend =
    !busy &&
    !images.failed &&
    !video.blocked &&
    (!!body.trim() ||
      images.items.length > 0 ||
      video.upload.status === "done");
  // In the ticket panel over the board, Esc or a click outside would throw an unsent reply away: ask first. (The ticket
  // page has no guard to register with, so there this does nothing.)
  const unsent =
    !!body.trim() || images.items.length > 0 || video.upload.status !== "idle";
  const closeCheck = useCallback(
    () => !unsent || window.confirm("Discard the reply you haven't sent?"),
    [unsent],
  );
  useCloseGuard(closeCheck);

  return (
    <form
      onSubmit={submitKeepingInput(action)}
      className="grid gap-3"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) e.preventDefault();
      }}
      onDrop={(e) => {
        const files = [...e.dataTransfer.files];
        if (!files.length) return;
        e.preventDefault();
        // The markup dialog is this form's child in React, so what's dropped on it arrives here too.
        if (!e.currentTarget.contains(e.target as Node)) return;
        const clip = files.find((f) => f.type.startsWith("video/"));
        if (clip) void video.start(clip);
        const rest = files.filter((f) => f !== clip);
        if (rest.length) images.add(rest);
      }}
    >
      <input type="hidden" name="id" value={ticket.id} />
      <input type="hidden" name="number" value={ticket.number} />
      <label
        htmlFor="body"
        className={full ? "text-[0.9063rem] font-medium" : "sr-only"}
      >
        {full ? "Reply" : "Your message"}
      </label>
      <Textarea
        id="body"
        name="body"
        rows={3}
        maxLength={20000}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onPaste={images.onPaste}
        onKeyDown={(e) => {
          // Enter sends, like a chat; Shift+Enter starts a new line. Not while an IME is composing a word, and not
          // while files are still uploading (the message would go without them). A phone keyboard has no Shift+Enter, so
          // there Enter starts a new line and the Send button sends.
          if (
            touch ||
            e.key !== "Enter" ||
            e.shiftKey ||
            e.nativeEvent.isComposing
          )
            return;
          e.preventDefault();
          if (canSend) e.currentTarget.form?.requestSubmit();
        }}
        placeholder={
          touch
            ? `${asking}…`
            : `${asking}… (Enter to send, Shift+Enter for a new line, Ctrl+V to paste a screenshot)`
        }
      />
      <ImagePicker state={images} id="comment-images" compact />
      <VideoPicker state={video} id="comment-video" compact />
      <FormMessage state={state} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <AttachMenu
          images={images}
          video={video}
          imagesId="comment-images"
          videoId="comment-video"
          long={full}
        />
        <Button
          type="submit"
          disabled={!canSend}
          variant={full ? "soft" : "default"}
          size={full ? "sm" : "default"}
        >
          <SendIcon />{" "}
          {video.busy
            ? "Uploading video…"
            : images.busy
              ? "Uploading…"
              : images.failed || video.blocked
                ? "Finish the files above"
                : pending
                  ? "Sending…"
                  : full
                    ? "Send reply"
                    : "Send"}
        </Button>
      </div>
    </form>
  );
}

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

export function EditTicketDialog({
  ticket,
  areas,
  people,
  open,
  onOpenChange,
}: {
  ticket: TicketValues;
  areas: AreaOption[];
  people: AssigneeOption[];
  /** Opened from the ⋯ More menu instead of its own button. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <FormDialog
      wide
      title={`Edit #${ticket.number}`}
      open={open}
      onOpenChange={onOpenChange}
      trigger={
        open === undefined ? (
          <Button variant="outline" size="sm">
            Edit
          </Button>
        ) : undefined
      }
    >
      {(close) => (
        <TicketForm
          areas={areas}
          people={people}
          canAssign={false}
          ticket={ticket}
          onDone={close}
        />
      )}
    </FormDialog>
  );
}

/**
 * The ticket's ⋯ More menu: Edit and Delete, kept out of the way so the title row holds only the status moves. Each item
 * opens its usual dialog; Delete still asks for the exact title.
 */
export function TicketMoreMenu({
  edit,
  del,
}: {
  edit: {
    ticket: TicketValues;
    areas: AreaOption[];
    people: AssigneeOption[];
  } | null;
  del: {
    ticket: { id: string; number: number; title: string };
    replies: number;
    files: number;
  } | null;
}) {
  const [dialog, setDialog] = useState<"edit" | "delete" | null>(null);
  if (!edit && !del) return null;
  const item =
    "flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm outline-none data-highlighted:bg-row-hover [&_svg]:size-4";
  return (
    <>
      <Menu.Root>
        <Menu.Trigger
          render={
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="More actions"
              title="More actions"
              className="data-popup-open:bg-acc-t2"
            />
          }
        >
          <EllipsisIcon aria-hidden />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner
            side="bottom"
            align="end"
            sideOffset={6}
            className="isolate z-50"
          >
            <Menu.Popup className="w-48 origin-(--transform-origin) rounded-xl bg-popover p-1.5 text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-150 ease-(--ease-out) data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
              {edit ? (
                <Menu.Item className={item} onClick={() => setDialog("edit")}>
                  <PencilIcon aria-hidden /> Edit ticket
                </Menu.Item>
              ) : null}
              {del ? (
                <Menu.Item
                  className={cn(
                    item,
                    "text-destructive-text data-highlighted:bg-bad-w",
                  )}
                  onClick={() => setDialog("delete")}
                >
                  <Trash2Icon aria-hidden /> Delete ticket
                </Menu.Item>
              ) : null}
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
      {edit ? (
        <EditTicketDialog
          {...edit}
          open={dialog === "edit"}
          onOpenChange={(o) => setDialog(o ? "edit" : null)}
        />
      ) : null}
      {del ? (
        <DeleteTicketDialog
          {...del}
          open={dialog === "delete"}
          onOpenChange={(o) => setDialog(o ? "delete" : null)}
        />
      ) : null}
    </>
  );
}
