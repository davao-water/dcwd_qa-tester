"use client";

import { useActionState, useState } from "react";
import { FolderPlusIcon, PencilIcon, PlusIcon, UserPlusIcon } from "lucide-react";
import { Field, FormMessage } from "@/components/form-field";
import { SelectField } from "@/components/select-field";
import { FormDialog } from "@/components/form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ROLE_LABELS, ROLES, type Role } from "@/lib/auth/permissions";
import { initialFormState, type FormState } from "@/lib/form";
import { saveArea, saveAreaMembers } from "./actions";

export type AreaValues = {
  id: string;
  name: string;
  code: string | null;
  parentId: string | null;
  sortOrder: number;
  active: boolean;
};
/** `designer`: has the Designer tick-box, so they can work on a module as its UI/UX designer. */
export type PersonOption = { id: string; name: string; role: Role; designer: boolean };
type MemberValue = { userId: string; isLead: boolean; asDesigner: boolean };

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

export function MembersDialog({
  areaId,
  areaName,
  people,
  members,
}: {
  areaId: string;
  areaName: string;
  people: PersonOption[];
  members: MemberValue[];
}) {
  return (
    <FormDialog
      wide
      title={`Members of ${areaName}`}
      description="Tick everyone who works on this area. The lead is the first developer QA should contact. A designer can work here as its UI/UX designer."
      trigger={
        <Button variant="ghost" size="icon-sm" aria-label={`Edit members of ${areaName}`}>
          <UserPlusIcon />
        </Button>
      }
    >
      {(close) => <MembersForm areaId={areaId} people={people} members={members} onDone={close} />}
    </FormDialog>
  );
}

function MembersForm({ areaId, people, members, onDone }: { areaId: string; people: PersonOption[]; members: MemberValue[]; onDone: () => void }) {
  const [state, action, pending] = useActionState(async (prev: FormState, fd: FormData) => {
    const r = await saveAreaMembers(prev, fd);
    if (r.ok) onDone();
    return r;
  }, initialFormState);
  const [chosen, setChosen] = useState(() => new Set(members.map((m) => m.userId)));
  const [lead, setLead] = useState(members.find((m) => m.isLead)?.userId ?? "");
  // Members who work here as the UI/UX designer (listed under UI/UX instead of their role).
  const [design, setDesign] = useState(() => new Set(members.filter((m) => m.asDesigner).map((m) => m.userId)));
  const toggleDesign = (id: string, on: boolean) => {
    const next = new Set(design);
    if (on) next.add(id);
    else next.delete(id);
    setDesign(next);
  };
  const [filter, setFilter] = useState("");

  const toggle = (id: string) => {
    const next = new Set(chosen);
    if (next.has(id)) {
      next.delete(id);
      if (lead === id) setLead("");
      if (design.has(id)) toggleDesign(id, false);
    } else next.add(id);
    setChosen(next);
  };
  const q = filter.trim().toLowerCase();
  const visible = people.filter((p) => !q || p.name.toLowerCase().includes(q));

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="areaId" value={areaId} />
      <input type="hidden" name="lead" value={lead} />
      {[...chosen].map((id) => (
        <input key={id} type="hidden" name="member" value={id} />
      ))}
      {[...design].filter((id) => chosen.has(id)).map((id) => (
        <input key={`d-${id}`} type="hidden" name="designer" value={id} />
      ))}
      <Input placeholder="Filter by name…" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter people" />
      {people.length === 0 ? <p className="text-sm text-muted-foreground">No active users yet. Add them in Admin → Users.</p> : null}
      {ROLES.map((role) => {
        const group = visible.filter((p) => p.role === role);
        if (!group.length) return null;
        return (
          <fieldset key={role} className="grid gap-1.5">
            <legend className="mb-1.5 text-xs font-semibold tracking-[0.06em] text-ink2 uppercase">{ROLE_LABELS[role]}s</legend>
            {group.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 hover:bg-surface2">
                <label className="flex items-center gap-2.5 text-sm">
                  <input type="checkbox" checked={chosen.has(p.id)} onChange={() => toggle(p.id)} />
                  {p.name}
                  {p.designer ? <span className="text-[0.75rem] text-muted-foreground">Designer</span> : null}
                </label>
                <span className="flex items-center gap-4">
                  {/* Only people with the Designer tick-box can work on a module as its UI/UX designer. */}
                  {p.designer ? (
                    <label className="flex items-center gap-1.5 text-[0.8125rem] text-muted-foreground">
                      <input type="checkbox" checked={design.has(p.id)} disabled={!chosen.has(p.id)} onChange={(e) => toggleDesign(p.id, e.target.checked)} />
                      UI/UX
                    </label>
                  ) : null}
                  {p.role !== "QA" ? (
                    <label className="flex items-center gap-1.5 text-[0.8125rem] text-muted-foreground">
                      <input type="radio" name="lead-pick" checked={lead === p.id} disabled={!chosen.has(p.id)} onChange={() => setLead(p.id)} />
                      Lead
                    </label>
                  ) : null}
                </span>
              </div>
            ))}
          </fieldset>
        );
      })}
      <FormMessage state={state} />
      <div className="flex items-center justify-between gap-3">
        <span className="text-[0.8125rem] text-muted-foreground">{chosen.size} selected{lead ? "" : " · no lead"}</span>
        <div className="flex gap-2">
          {lead ? <Button type="button" variant="ghost" onClick={() => setLead("")}>Clear lead</Button> : null}
          <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save members"}</Button>
        </div>
      </div>
    </form>
  );
}
