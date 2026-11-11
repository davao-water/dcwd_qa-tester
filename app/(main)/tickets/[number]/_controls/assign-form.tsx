"use client";

import { FormMessage } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { initialFormState, type FormState } from "@/lib/form";
import { useActionState, useState } from "react";
import { assignTicket } from "../../actions";
import { AssigneeSelect } from "../../_form/assignee-select";
import { submitKeepingInput } from "@/components/submit-keeping-input";
import type { AreaOption, AssigneeOption } from "../../_form/types";
import type { Ref } from "@/lib/tickets/ticket-ref";

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
