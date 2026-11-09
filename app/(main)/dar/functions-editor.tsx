"use client";

import { useState } from "react";
import { ArrowUpIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react";
import { SelectField } from "@/components/select-field";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { moduleOptions, pathTo, type TreeNode } from "@/lib/areas/tree";
import { MAX_FUNCTION_ROWS, type DarFunction } from "@/lib/dar/template";

/** A module with what's inside it, for linking a row to modules. */
export type DarAreaOption = TreeNode<{ id: string; name: string }>;

// The list of core or support functions on a DAR: the duty, its MFO, and whether the row gets the days filled in
// from ticket work. A duty with several MFOs takes one row per MFO: the rows after the first tick "Another MFO of the
// duty above" and have no duty of their own. Posted as JSON in a hidden input named `name`; empty rows are left out.

export function FunctionsEditor({ name, label, initial, areas }: { name: string; label: string; initial: DarFunction[]; areas: DarAreaOption[] }) {
  const [rows, setRows] = useState<DarFunction[]>(initial);
  const set = (i: number, patch: Partial<DarFunction>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const kept = rows.filter((r, i) => (r.continues && i > 0 ? r.mfo.trim() : r.duty.trim()));

  return (
    <fieldset className="grid gap-3">
      <legend className="mb-1 text-sm font-medium">{label}</legend>
      <input type="hidden" name={name} value={JSON.stringify(kept)} />
      {rows.map((r, i) => (
        <div key={i} className="grid gap-2.5 rounded-[0.625rem] border border-line p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[0.7813rem] font-semibold text-muted-foreground">Row {i + 1}</span>
            <div className="flex items-center gap-1">
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`Move row ${i + 1} up`} disabled={i === 0} onClick={() => setRows([...rows.slice(0, i - 1), r, rows[i - 1], ...rows.slice(i + 1)])}>
                <ArrowUpIcon />
              </Button>
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove row ${i + 1}`} onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                <Trash2Icon />
              </Button>
            </div>
          </div>
          {i > 0 ? (
            <label className="flex items-center gap-2 text-[0.8125rem]">
              <input type="checkbox" checked={!!r.continues} onChange={(e) => set(i, { continues: e.target.checked })} />
              Another MFO of the duty above (the duty cell is shared)
            </label>
          ) : null}
          <div className={r.continues && i > 0 ? "grid gap-2.5" : "grid gap-2.5 md:grid-cols-2"}>
            {r.continues && i > 0 ? null : (
              <label className="grid content-start gap-1.5 text-[0.8125rem]">
                Duty
                <Textarea value={r.duty} onChange={(e) => set(i, { duty: e.target.value })} rows={4} maxLength={1000} />
              </label>
            )}
            <label className="grid content-start gap-1.5 text-[0.8125rem]">
              Major final output (MFO)
              <Textarea value={r.mfo} onChange={(e) => set(i, { mfo: e.target.value })} rows={4} maxLength={1000} placeholder="One per line, e.g. • Performs documentation and test reports" />
            </label>
          </div>
          <label className="flex items-center gap-2 text-[0.8125rem]">
            <input type="checkbox" checked={r.autofill} onChange={(e) => set(i, { autofill: e.target.checked })} />
            Fill this row&apos;s days from my ticket work
          </label>
          {r.autofill ? <ModuleLinks areas={areas} value={r.areaIds ?? []} onChange={(areaIds) => set(i, { areaIds })} /> : null}
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" className="justify-self-start" disabled={rows.length >= MAX_FUNCTION_ROWS} onClick={() => setRows([...rows, { duty: "", mfo: "", autofill: false }])}>
        <PlusIcon /> Add row
      </Button>
    </fieldset>
  );
}

/**
 * Which modules' ticket work fills the row: any level, everything inside a module included. None: work no other row is
 * linked to. A module is added from the list and removed with its ×.
 */
function ModuleLinks({ areas, value, onChange }: { areas: DarAreaOption[]; value: string[]; onChange: (ids: string[]) => void }) {
  const name = (id: string) => pathTo(areas, id).map((a) => a.name).join(" › ") || "A module that was removed";
  return (
    <div className="grid gap-2 rounded-lg bg-surface2 p-2.5">
      <span className="text-[0.8125rem] font-medium">Fill from tickets in</span>
      {value.length ? (
        <span className="flex flex-wrap gap-1.5">
          {value.map((id) => (
            <span key={id} className="inline-flex h-7 items-center gap-1 rounded-full bg-acc-t pr-1 pl-2.5 text-[0.8125rem] text-acc-ink">
              {name(id)}
              <button type="button" aria-label={`Remove ${name(id)}`} onClick={() => onChange(value.filter((v) => v !== id))} className="flex size-5 items-center justify-center rounded-full hover:bg-acc-b">
                <XIcon className="size-3.5" aria-hidden />
              </button>
            </span>
          ))}
        </span>
      ) : (
        <span className="text-[0.8125rem] text-muted-foreground">Any module no other row is linked to.</span>
      )}
      <SelectField
        // Reset to the placeholder after each pick.
        key={value.join(",")}
        id={`link-${value.join("-") || "none"}`}
        defaultValue=""
        onValueChange={(v) => v && !value.includes(v) && value.length < 20 && onChange([...value, v])}
        groups={[{ options: [{ value: "", label: "Add a module…" }] }, ...moduleOptions(areas, "and everything in it")]}
      />
    </div>
  );
}
