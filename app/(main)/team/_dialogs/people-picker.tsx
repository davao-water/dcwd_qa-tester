"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { ROLE_LABELS, ROLES } from "@/lib/auth/permissions";
import type { PersonOption } from "./types";
import type { PeoplePick } from "./use-people-pick";

/** The people checklist, grouped by role, with the hidden `member`, `lead` and `designer` fields the actions read. */
export function PeoplePicker({ people, pick }: { people: PersonOption[]; pick: PeoplePick }) {
  const { chosen, lead, setLead, design, toggle, toggleDesign } = pick;
  const [filter, setFilter] = useState("");
  const q = filter.trim().toLowerCase();
  const visible = people.filter((p) => !q || p.name.toLowerCase().includes(q));

  return (
    <div className="grid gap-4">
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
    </div>
  );
}
