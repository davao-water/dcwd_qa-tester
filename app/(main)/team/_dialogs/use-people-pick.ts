"use client";

import { useState } from "react";
import type { MemberValue } from "./types";

/** Who is ticked, who leads, and who works here as UI/UX: shared by Members and Assign to modules. */
export function usePeoplePick(members: MemberValue[]) {
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
  const toggle = (id: string) => {
    const next = new Set(chosen);
    if (next.has(id)) {
      next.delete(id);
      if (lead === id) setLead("");
      if (design.has(id)) toggleDesign(id, false);
    } else next.add(id);
    setChosen(next);
  };
  return { chosen, lead, setLead, design, toggle, toggleDesign };
}

export type PeoplePick = ReturnType<typeof usePeoplePick>;
