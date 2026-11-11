"use client";

import { useActionState, useState } from "react";
import { FolderPlusIcon, PencilIcon, PlusIcon } from "lucide-react";
import { Field, FormMessage } from "@/components/form-field";
import { SelectField } from "@/components/select-field";
import { FormDialog } from "@/components/form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { initialFormState, type FormState } from "@/lib/form";
import { saveArea } from "../actions";
import type { AreaValues } from "./types";

/**
 * New module, new sub-module (when `parentId` is given: a module, or a sub-module for one level further in) or edit
 * (when `area` is given). `modules`: where an area may go, each by its full path. `labelled`: a small text button
 * ("Add sub-module", "Edit module") for the module's header, instead of the icon used on table rows.
 */
export function AreaDialog({ modules, area, parentId, labelled }: { modules: { id: string; name: string }[]; area?: AreaValues; parentId?: string; labelled?: boolean }) {
  const parentName = parentId ? modules.find((m) => m.id === parentId)?.name : undefined;
  return (
    <FormDialog
      title={area ? `Edit ${area.parentId ? "sub-module" : "module"}` : parentId ? `New sub-module in ${parentName}` : "New module"}
      trigger={
        labelled && area ? (
          <Button variant="outline" size="sm">
            <PencilIcon /> Edit module
          </Button>
        ) : labelled && parentId ? (
          <Button variant="outline" size="sm">
            <FolderPlusIcon /> Add sub-module
          </Button>
        ) : area ? (
          <Button variant="ghost" size="icon-sm" aria-label={`Edit ${area.name}`}>
            <PencilIcon />
          </Button>
        ) : parentId ? (
          <Button variant="ghost" size="icon-sm" aria-label={`Add a sub-module to ${parentName}`}>
            <FolderPlusIcon />
          </Button>
        ) : (
          <Button>
            <PlusIcon /> Add module
          </Button>
        )
      }
    >
      {(close) => <AreaForm modules={modules} area={area} parentId={parentId} onDone={close} />}
    </FormDialog>
  );
}

function AreaForm({ modules, area, parentId, onDone }: { modules: { id: string; name: string }[]; area?: AreaValues; parentId?: string; onDone: () => void }) {
  const [state, action, pending] = useActionState(async (prev: FormState, fd: FormData) => {
    const r = await saveArea(prev, fd);
    if (r.ok) onDone();
    return r;
  }, initialFormState);
  const err = state.fieldErrors ?? {};
  const parent = area ? area.parentId : (parentId ?? null);
  const [isSub, setIsSub] = useState(parent !== null);

  return (
    <form action={action} className="grid gap-4">
      {area ? <input type="hidden" name="id" value={area.id} /> : null}
      <Field label="Name" htmlFor="name" error={err.name} required>
        <Input id="name" name="name" defaultValue={area?.name} required maxLength={100} placeholder={isSub ? "e.g. Purchase Requisition" : "e.g. Procurement"} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Short code" htmlFor="code" error={err.code} hint="Optional, e.g. BCA-MR.">
          <Input id="code" name="code" defaultValue={area?.code ?? ""} maxLength={20} className="font-mono uppercase" />
        </Field>
        {/* Sub-modules are listed in the order they're added; only top-level modules take a sort order. */}
        {!isSub ? (
          <Field label="Sort order" htmlFor="sortOrder" error={err.sortOrder} hint="Lower comes first.">
            <Input id="sortOrder" name="sortOrder" type="number" min={0} max={999} defaultValue={area?.sortOrder ?? 0} />
          </Field>
        ) : null}
      </div>
      <Field label="Inside" htmlFor="parentId" error={err.parentId} hint="A module, or a sub-module for one more level. Leave empty for a top-level module.">
        <SelectField
          id="parentId"
          name="parentId"
          defaultValue={parent ?? ""}
          onValueChange={(v) => setIsSub(v !== "")}
          options={[{ value: "", label: "— Top-level module —" }, ...modules.filter((m) => m.id !== area?.id).map((m) => ({ value: m.id, label: m.name }))]}
        />
      </Field>
      <label className="flex items-center gap-2.5 text-sm">
        <input type="checkbox" name="active" defaultChecked={area?.active ?? true} />
        Show in ticket forms
      </label>
      <FormMessage state={state} />
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
      </div>
    </form>
  );
}
