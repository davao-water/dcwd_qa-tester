"use client";

import { SelectField } from "@/components/select-field";
import { moduleOptions } from "@/lib/areas/tree";
import type { AreaOption } from "./types";

export function AreaSelect({ areas, value, onChange, emptyLabel, invalid, id = "areaId" }: { areas: AreaOption[]; value: string; onChange: (v: string) => void; emptyLabel: string; invalid?: boolean; id?: string }) {
  return (
    <SelectField
      id={id}
      name="areaId"
      value={value}
      onValueChange={onChange}
      aria-invalid={invalid}
      groups={[
        { options: [{ value: "", label: emptyLabel }] },
        ...moduleOptions(areas, "whole module"),
      ]}
    />
  );
}
