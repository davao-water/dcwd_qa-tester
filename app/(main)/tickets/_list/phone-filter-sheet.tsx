import Link from "next/link";
import { Field } from "@/components/form-field";
import { SelectField } from "@/components/select-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FilterSheet } from "../filter-sheet";
import type { FilterFormProps } from "./filter-options";
import { KeepFields } from "./keep-fields";

/** Phones: the Filters button opens a sheet with every filter, one under the other. */
export function PhoneFilterSheet({ active, ...props }: FilterFormProps & { active: number }) {
  const { f, options, showQa, showDev, formKey, clearHref } = props;
  return (
    <FilterSheet active={active}>
      <form key={formKey} action="/tickets" className="grid gap-4">
        <KeepFields f={f} showQa={showQa} />
        {f.q ? <input type="hidden" name="q" value={f.q} /> : null}
        <Field label="Type" htmlFor="ftype">
          <SelectField id="ftype" name="type" defaultValue={f.type ?? ""} options={options.type} />
        </Field>
        <Field label="Module" htmlFor="farea">
          <SelectField id="farea" name="area" defaultValue={f.area ?? ""} groups={options.area} />
        </Field>
        <Field label="Category" htmlFor="fcategory">
          <SelectField id="fcategory" name="category" defaultValue={f.category ?? ""} options={options.category} />
        </Field>
        <Field label="Status" htmlFor="fstatus">
          <SelectField id="fstatus" name="status" defaultValue={f.status ?? ""} options={options.status} />
        </Field>
        {showQa ? (
          <Field label="QA tester" htmlFor="freporter">
            <SelectField id="freporter" name="reporter" defaultValue={f.reporter ?? ""} options={options.reporter} />
          </Field>
        ) : null}
        {showDev ? (
          <Field label="Developer" htmlFor="fassignee">
            <SelectField id="fassignee" name="assignee" defaultValue={f.assignee ?? ""} options={options.assignee} />
          </Field>
        ) : null}
        <Field label="Severity" htmlFor="fseverity">
          <SelectField id="fseverity" name="severity" defaultValue={f.severity ?? ""} options={options.severity} />
        </Field>
        <Field label="Priority" htmlFor="fpriority">
          <SelectField id="fpriority" name="priority" defaultValue={f.priority ?? ""} options={options.priority} />
        </Field>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Filed from" htmlFor="ffrom">
            <Input id="ffrom" type="date" name="from" defaultValue={f.from ?? ""} max={f.to ?? undefined} />
          </Field>
          <Field label="Filed to" htmlFor="fto">
            <Input id="fto" type="date" name="to" defaultValue={f.to ?? ""} min={f.from ?? undefined} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2.5 pt-1">
          <Button variant="outline" size="lg" nativeButton={false} render={<Link href={clearHref} />}>
            Clear
          </Button>
          <Button type="submit" size="lg">Apply</Button>
        </div>
      </form>
    </FilterSheet>
  );
}
