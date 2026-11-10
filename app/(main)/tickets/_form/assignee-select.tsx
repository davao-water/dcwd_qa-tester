"use client";

import { SelectField } from "@/components/select-field";
import { pathTo } from "@/lib/areas/tree";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import type { AreaOption, AssigneeOption } from "./types";

/** Developers in the chosen area (or any module it sits inside) first, with the lead marked; everyone else after. */
export function AssigneeSelect({
  areas,
  people,
  areaId,
  defaultValue,
  id = "assigneeId",
  onValueChange,
}: {
  areas: AreaOption[];
  people: AssigneeOption[];
  areaId: string;
  defaultValue?: string;
  id?: string;
  onValueChange?: (assigneeId: string) => void;
}) {
  const scope = areaId ? pathTo(areas, areaId).map((a) => a.id) : [];
  const inArea = people
    .filter((p) => p.areaIds.some((a) => scope.includes(a)))
    .sort((a, b) => Number(b.leadAreaIds.some((x) => scope.includes(x))) - Number(a.leadAreaIds.some((x) => scope.includes(x))));
  const others = people.filter((p) => !inArea.includes(p));
  const label = (p: AssigneeOption) =>
    `${p.name}${p.leadAreaIds.some((x) => scope.includes(x)) ? " · lead" : ""}${p.role === "ADMIN" ? ` · ${ROLE_LABELS.ADMIN}` : ""}`;

  return (
    <SelectField
      key={areaId}
      id={id}
      name="assigneeId"
      defaultValue={defaultValue ?? ""}
      onValueChange={onValueChange}
      groups={[
        { options: [{ value: "", label: "— Not assigned yet —" }] },
        ...(inArea.length ? [{ label: "Works on this module", options: inArea.map((p) => ({ value: p.id, label: label(p) })) }] : []),
        { label: inArea.length ? "Everyone else" : "Developers", options: others.map((p) => ({ value: p.id, label: label(p) })) },
      ]}
    />
  );
}
