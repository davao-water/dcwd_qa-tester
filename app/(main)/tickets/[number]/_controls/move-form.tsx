"use client";

import { Field, FormMessage } from "@/components/form-field";
import { SelectField } from "@/components/select-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { initialFormState, type FormState } from "@/lib/form";
import type { TicketStatus, Transition } from "@/lib/tickets/workflow";
import { useActionState, useState } from "react";
import { handBackTicket, moveTicket } from "../../actions";
import { submitKeepingInput } from "@/components/submit-keeping-input";
import type { Ref } from "@/lib/tickets/ticket-ref";

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
