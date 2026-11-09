"use client";

import { Fragment } from "react";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

// A dropdown in place of a native <select>: give it options (or groups of options) and a `name`, and it posts its
// value with the form. Controlled (`value` + `onValueChange`) or not (`defaultValue`). "" is a normal value, used for
// "Any" or "Not set" choices, as with the native selects it replaces.

/** `dot`: a colour class for a small dot before the label, as on Severity and Priority. The label always says the same thing in words. */
export type SelectOption = {
  value: string;
  /** What the closed dropdown shows. */
  label: string;
  dot?: string;
  /** A row of a parent-and-children list (lib/areas/tree.ts moduleOptions): the name in the open list, with `label` as its full name for screen readers. */
  tree?: { name: string; level: 0 | 1 | 2; note?: string };
};
/** `rule`: a line above the group, separating one parent and its children from the next. */
export type SelectOptionGroup = { label?: string; rule?: boolean; options: SelectOption[] };

function OptionLabel({ option }: { option: SelectOption }) {
  if (!option.dot) return option.label;
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className={cn("size-2 shrink-0 rounded-full", option.dot)} aria-hidden />
      <span className="truncate">{option.label}</span>
    </span>
  );
}

function Option({ option: o }: { option: SelectOption }) {
  if (!o.tree) {
    return (
      <SelectItem value={o.value}>
        <OptionLabel option={o} />
      </SelectItem>
    );
  }
  if (o.tree.level === 0) {
    return (
      <SelectItem value={o.value} aria-label={o.label}>
        <span className="truncate font-semibold">{o.tree.name}</span>
        {o.tree.note ? <span className="shrink-0 text-[0.7813rem] font-normal text-muted-foreground">{o.tree.note}</span> : null}
      </SelectItem>
    );
  }
  // A sub-module hangs off its module's line; one level further in, off its sub-module's line too.
  const deep = o.tree.level === 2;
  return (
    <SelectItem value={o.value} aria-label={o.label}>
      {/* The branch joining this child to its parent above. */}
      <span aria-hidden className="absolute inset-y-0 left-4 w-px bg-input" />
      {deep ? <span aria-hidden className="absolute inset-y-0 left-8 w-px bg-input" /> : null}
      <span aria-hidden className={cn("absolute top-1/2 h-px w-2.5 bg-input", deep ? "left-8" : "left-4")} />
      <span className={cn("truncate", deep ? "pl-9" : "pl-5")}>{o.tree.name}</span>
    </SelectItem>
  );
}

export function SelectField({
  id,
  name,
  value,
  defaultValue,
  onValueChange,
  options,
  groups,
  size,
  className,
  disabled,
  required,
  "aria-label": ariaLabel,
  "aria-invalid": ariaInvalid,
}: {
  id?: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  options?: SelectOption[];
  groups?: SelectOptionGroup[];
  size?: "sm" | "default";
  className?: string;
  disabled?: boolean;
  required?: boolean;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
}) {
  const all = groups ?? [{ options: options ?? [] }];
  const items = all.flatMap((g) => g.options);
  const hasDots = items.some((o) => o.dot);
  const chosen = (v: unknown) => {
    const option = items.find((o) => o.value === v);
    return option ? <OptionLabel option={option} /> : null;
  };
  return (
    <Select
      name={name}
      items={items}
      value={value}
      defaultValue={defaultValue}
      onValueChange={(v) => onValueChange?.((v as string | null) ?? "")}
      disabled={disabled}
      required={required}
    >
      <SelectTrigger id={id} size={size} className={className} aria-label={ariaLabel} aria-invalid={ariaInvalid}>
        {hasDots ? <SelectValue>{chosen}</SelectValue> : <SelectValue />}
      </SelectTrigger>
      <SelectContent>
        {all.map((g, i) => (
          <Fragment key={g.label ?? i}>
            {g.label ? (
              <SelectGroup>
                <SelectLabel>{g.label}</SelectLabel>
                {g.options.map((o) => (
                  <Option key={o.value} option={o} />
                ))}
              </SelectGroup>
            ) : g.rule ? (
              <SelectGroup className="mt-0.5 border-t border-line2">
                {g.options.map((o) => (
                  <Option key={o.value} option={o} />
                ))}
              </SelectGroup>
            ) : (
              g.options.map((o) => <Option key={o.value} option={o} />)
            )}
          </Fragment>
        ))}
      </SelectContent>
    </Select>
  );
}
