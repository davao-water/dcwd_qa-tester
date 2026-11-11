"use client";

import { useActionState, useState } from "react";
import { UsersRoundIcon } from "lucide-react";
import { FormMessage, FormSection } from "@/components/form-field";
import { FormDialog } from "@/components/form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { initialFormState, type FormState } from "@/lib/form";
import { cn } from "@/lib/utils";
import { assignToModules } from "../actions";
import { PeoplePicker } from "./people-picker";
import type { AreaOption, PersonOption } from "./types";
import { usePeoplePick } from "./use-people-pick";

/** Team & modules header: add the same people to many modules and sub-modules at once. */
export function AssignDialog({ people, areas }: { people: PersonOption[]; areas: AreaOption[] }) {
  return (
    <FormDialog
      wide
      title="Assign to modules"
      description="Tick the people, then every module and sub-module they work on. People already in a module stay there; nobody is removed."
      trigger={
        <Button variant="outline">
          <UsersRoundIcon /> Assign to modules
        </Button>
      }
    >
      {(close) => <AssignForm people={people} areas={areas} onDone={close} />}
    </FormDialog>
  );
}

function AssignForm({ people, areas, onDone }: { people: PersonOption[]; areas: AreaOption[]; onDone: () => void }) {
  const [state, action, pending] = useActionState(async (prev: FormState, fd: FormData) => {
    const r = await assignToModules(prev, fd);
    if (r.ok) onDone();
    return r;
  }, initialFormState);
  const pick = usePeoplePick([]);
  const [picked, setPicked] = useState(() => new Set<string>());
  const [filter, setFilter] = useState("");

  const toggleArea = (id: string) => {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  };
  // "All inside" ticks a module's sub-modules (at every depth); when they are all ticked it unticks them.
  const toggleInside = (inside: string[]) => {
    const next = new Set(picked);
    const all = inside.every((id) => next.has(id));
    for (const id of inside) {
      if (all) next.delete(id);
      else next.add(id);
    }
    setPicked(next);
  };
  const q = filter.trim().toLowerCase();
  const visible = areas.filter((a) => !q || a.name.toLowerCase().includes(q) || a.code?.toLowerCase().includes(q));

  return (
    <form action={action} className="grid gap-4">
      {[...picked].map((id) => (
        <input key={id} type="hidden" name="area" value={id} />
      ))}
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="grid content-start gap-2">
          <FormSection>People</FormSection>
          <PeoplePicker people={people} pick={pick} />
        </div>
        <div className="grid content-start gap-2">
          <FormSection>Modules</FormSection>
          <div className="grid gap-4">
            <Input placeholder="Filter modules…" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter modules" />
            {areas.length === 0 ? <p className="text-sm text-muted-foreground">No modules yet. Add one first.</p> : null}
            {areas.length > 0 && visible.length === 0 ? <p className="text-sm text-muted-foreground">No module matches.</p> : null}
            <div className="grid gap-0.5">
              {visible.map((a) => {
                const allInside = a.inside.length > 0 && a.inside.every((id) => picked.has(id));
                return (
                  <div key={a.id} className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 hover:bg-surface2" style={{ paddingLeft: `${0.5 + a.depth * 1.25}rem` }}>
                    <label className={cn("flex min-w-0 items-center gap-2.5 text-sm", a.depth === 0 && "font-medium", a.hidden && "opacity-60")}>
                      <input type="checkbox" checked={picked.has(a.id)} onChange={() => toggleArea(a.id)} />
                      <span className="truncate" title={a.name}>{a.name}</span>
                      {a.code ? <span className="shrink-0 font-mono text-[0.75rem] text-muted-foreground">{a.code}</span> : null}
                      {a.hidden ? <span className="shrink-0 text-[0.75rem] text-muted-foreground">(hidden)</span> : null}
                    </label>
                    {a.inside.length ? (
                      <Button type="button" variant="ghost" size="sm" className="shrink-0" onClick={() => toggleInside(a.inside)} aria-label={`${allInside ? "Untick" : "Tick"} everything inside ${a.name}`}>
                        {allInside ? "None inside" : "All inside"}
                      </Button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      <FormMessage state={state} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-[0.8125rem] text-muted-foreground">
          {pick.chosen.size} {pick.chosen.size === 1 ? "person" : "people"} · {picked.size} module{picked.size === 1 ? "" : "s"}
          {pick.lead ? " · lead replaces the current one" : ""}
        </span>
        <div className="flex gap-2">
          {pick.lead ? <Button type="button" variant="ghost" onClick={() => pick.setLead("")}>Clear lead</Button> : null}
          <Button type="submit" disabled={pending || pick.chosen.size === 0 || picked.size === 0}>{pending ? "Assigning…" : "Assign"}</Button>
        </div>
      </div>
    </form>
  );
}
