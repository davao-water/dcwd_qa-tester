"use client";

import { useActionState, useState, useTransition } from "react";
import { TimerIcon } from "lucide-react";
import { Field, FormMessage } from "@/components/form-field";
import { FormDialog } from "@/components/form-dialog";
import { InlineAlert } from "@/components/inline-alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GRANT_LABELS, GRANTABLE, type GrantableAction } from "@/lib/auth/permissions";
import { MAX_TEMP_HOURS as MAX_HOURS } from "@/lib/auth/temp-access";
import { initialFormState, type FormState } from "@/lib/form";
import { endTempAccess, giveTempAccess } from "../actions";

/**
 * Admin → Users: lend someone chosen admin features for 1–72 hours, or end it early. Managing accounts and roles is
 * never one of them. `current`: their live temporary access, with its end already written out ("Nov 9, 2026, 5:30 PM").
 */
export function TempAccessDialog({ user, current }: { user: { id: string; name: string }; current: { actions: GrantableAction[]; until: string } | null }) {
  return (
    <FormDialog
      title={`Temporary access for ${user.name}`}
      description="Lend chosen admin features for a few hours. It ends by itself; managing accounts and roles stays with admins."
      trigger={
        <Button variant="ghost" size="icon-sm" aria-label={`Temporary access for ${user.name}`} title="Temporary access">
          <TimerIcon />
        </Button>
      }
    >
      {(close) => <TempAccessForm user={user} current={current} onDone={close} />}
    </FormDialog>
  );
}

function TempAccessForm({ user, current, onDone }: { user: { id: string; name: string }; current: { actions: GrantableAction[]; until: string } | null; onDone: () => void }) {
  const [state, action, pending] = useActionState(async (prev: FormState, fd: FormData) => {
    const r = await giveTempAccess(prev, fd);
    if (r.ok) onDone();
    return r;
  }, initialFormState);
  const [ending, startEnding] = useTransition();
  const [endError, setEndError] = useState<string | null>(null);
  const end = () =>
    startEnding(async () => {
      const r = await endTempAccess(user.id);
      if (r.ok) onDone();
      else setEndError(r.message ?? "Couldn't end it. Try again.");
    });

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="userId" value={user.id} />
      {current ? (
        <InlineAlert tone="info" role="status">
          Has {current.actions.map((a) => GRANT_LABELS[a].label).join(", ")} until {current.until}. Saving again replaces it.
        </InlineAlert>
      ) : null}
      <fieldset className="grid gap-2">
        <legend className="mb-1.5 text-xs font-semibold tracking-[0.06em] text-ink2 uppercase">Features</legend>
        {GRANTABLE.map((a) => (
          <label key={a} className="flex items-start gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-surface2">
            <input type="checkbox" name="feature" value={a} defaultChecked={current?.actions.includes(a)} className="mt-0.5" />
            <span className="grid gap-0.5">
              <span className="font-medium">{GRANT_LABELS[a].label}</span>
              <span className="text-[0.8125rem] text-muted-foreground">{GRANT_LABELS[a].hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <Field label="For how many hours" htmlFor="hours" hint={`From 1 to ${MAX_HOURS}. It starts now.`} required>
        <Input id="hours" name="hours" type="number" inputMode="numeric" min={1} max={MAX_HOURS} step={1} defaultValue={4} required className="max-w-32" />
      </Field>
      <FormMessage state={state} />
      {endError ? <InlineAlert tone="bad" role="alert">{endError}</InlineAlert> : null}
      <div className="flex flex-wrap justify-end gap-2">
        {current ? (
          <Button type="button" variant="outline" disabled={ending || pending} onClick={end}>
            {ending ? "Ending…" : "End now"}
          </Button>
        ) : null}
        <Button type="submit" disabled={pending || ending}>{pending ? "Saving…" : current ? "Replace access" : "Give access"}</Button>
      </div>
    </form>
  );
}
