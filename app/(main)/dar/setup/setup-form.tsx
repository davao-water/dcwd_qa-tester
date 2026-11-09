"use client";

import { useActionState, useState } from "react";
import { Field, FormMessage, FormSection } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PERIOD_SCHEMES, SCHEME_LABELS, type PeriodScheme } from "@/lib/dar/period";
import type { DarHeader } from "@/lib/dar/template";
import { initialFormState } from "@/lib/form";
import { cn } from "@/lib/utils";
import { submitKeepingInput } from "../../tickets/ticket-form";
import { saveDarProfile } from "../actions";
import { FunctionsEditor, type DarAreaOption } from "../functions-editor";
import { FirstPeriodField } from "./first-period-field";

// The person's own DAR set-up, laid out like the old shared DAR template page. Empty fields stay empty on the report.

export function DarSetupForm({
  header: h,
  hasFullName,
  firstPeriodStart,
  scheme: initialScheme,
  today,
  areas,
}: {
  header: DarHeader;
  hasFullName: boolean;
  firstPeriodStart: string;
  scheme: PeriodScheme;
  today: string;
  /** Modules (every level), for linking a row to the modules whose ticket work fills it. */
  areas: DarAreaOption[];
}) {
  const [state, action, pending] = useActionState(saveDarProfile, initialFormState);
  const [scheme, setScheme] = useState<PeriodScheme>(initialScheme);
  const err = state.fieldErrors ?? {};

  return (
    <form onSubmit={submitKeepingInput(action)} className="grid gap-5">
      <FormSection>Periods</FormSection>
      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium">Your DAR periods run from</legend>
        <input type="hidden" name="periodScheme" value={scheme} />
        <div className="grid gap-2.5 sm:grid-cols-2">
          {PERIOD_SCHEMES.map((s) => (
            <label key={s} className="flex cursor-pointer items-center gap-2.5 rounded-[0.625rem] border border-line p-3 text-sm transition-colors has-checked:border-acc has-checked:bg-acc-t2 has-focus-visible:ring-3 has-focus-visible:ring-acc/25">
              <input type="radio" name="schemeChoice" checked={scheme === s} onChange={() => setScheme(s)} />
              <span>{SCHEME_LABELS[s]}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <FirstPeriodField initial={firstPeriodStart} today={today} scheme={scheme} error={err.firstPeriodStart} />

      <FormSection>Header</FormSection>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Full name" htmlFor="fullName" error={err.fullName} hint="As on official forms, e.g. Juan D. Dela Cruz. Your QA Hub nickname is used until you add it.">
          <Input id="fullName" name="fullName" defaultValue={hasFullName ? h.name : ""} maxLength={120} />
        </Field>
        <Field label="Position title" htmlFor="position" error={err.position}>
          <Input id="position" name="position" defaultValue={h.position} maxLength={120} placeholder="e.g. System Analyst" />
        </Field>
        <Field label="Department" htmlFor="department" error={err.department}>
          <Input id="department" name="department" defaultValue={h.department} maxLength={160} placeholder="e.g. Information and Communication Technology Department" />
        </Field>
        <Field label="Unit" htmlFor="unit" error={err.unit}>
          <Input id="unit" name="unit" defaultValue={h.unit} maxLength={160} placeholder="e.g. Data Management Unit" />
        </Field>
      </div>

      <FormSection>Signatories</FormSection>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Immediate supervisor (Confirmed by)" htmlFor="confirmedName" error={err.confirmedBy}>
          <Input id="confirmedName" name="confirmedName" defaultValue={h.confirmedBy.name} maxLength={120} />
        </Field>
        <Field label="Supervisor's title" htmlFor="confirmedTitle">
          <Input id="confirmedTitle" name="confirmedTitle" defaultValue={h.confirmedBy.title} maxLength={160} />
        </Field>
        <Field label="Noted by" htmlFor="notedName" error={err.notedBy}>
          <Input id="notedName" name="notedName" defaultValue={h.notedBy.name} maxLength={120} />
        </Field>
        <Field label="Noted by title" htmlFor="notedTitle">
          <Input id="notedTitle" name="notedTitle" defaultValue={h.notedBy.title} maxLength={160} />
        </Field>
      </div>

      <FormSection>Duties and MFOs</FormSection>
      <FunctionsEditor name="coreFunctions" label="A.) Core functions" initial={h.core} areas={areas} />
      <FunctionsEditor name="supportFunctions" label="B.) Support functions" initial={h.support} areas={areas} />
      {err.coreFunctions || err.supportFunctions ? (
        <p className="text-[0.7813rem] font-medium text-destructive-text">Every row needs a duty, unless it is another MFO of the duty above.</p>
      ) : null}

      <FormMessage state={state} />
      <div className="flex items-center justify-end gap-3">
        <span aria-live="polite" className={cn("text-[0.8125rem] text-muted-foreground", !state.ok && "sr-only")}>{state.ok ? state.message : ""}</span>
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save set-up"}</Button>
      </div>
    </form>
  );
}
