import Link from "next/link";
import { SearchIcon } from "lucide-react";
import { FilterDate } from "@/components/filter-date";
import { FilterSelect } from "@/components/filter-select";
import { Field } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { FilterFormProps } from "./filter-options";
import { KeepFields } from "./keep-fields";

/**
 * Laptops: the filters in a card with visible labels. A choice applies at once; search applies on Enter. It stays a
 * plain GET form, so it still works without scripts (the hidden Apply button).
 */
export function DeskFilters({
  f,
  options,
  showQa,
  showDev,
  formKey,
  clearHref,
  moreSet,
  filtered,
}: FilterFormProps & { moreSet: number; filtered: boolean }) {
  return (
    <form
      key={formKey}
      action="/tickets"
      aria-label="Filter tickets"
      className="max-md:hidden"
    >
      <Card className="flex-row flex-wrap items-end gap-2.5 p-4">
        <KeepFields f={f} showQa={showQa} />
        <Field
          label="Search"
          htmlFor="tq"
          className="min-w-0 flex-[2_1_17.5rem]"
        >
          <div className="relative">
            <SearchIcon
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              id="tq"
              type="search"
              name="q"
              defaultValue={f.q}
              enterKeyHint="search"
              placeholder="Title, text or #number"
              className="pl-9"
            />
          </div>
        </Field>
        <Field
          label="Type"
          htmlFor="ttype"
          className="min-w-0 flex-[1_1_9.5rem]"
        >
          <FilterSelect
            id="ttype"
            name="type"
            defaultValue={f.type ?? ""}
            options={options.type}
          />
        </Field>
        <Field
          label="Module"
          htmlFor="tarea"
          className="min-w-0 flex-[1_1_12rem]"
        >
          <FilterSelect
            id="tarea"
            name="area"
            defaultValue={f.area ?? ""}
            groups={options.area}
          />
        </Field>
        <Field
          label="Category"
          htmlFor="tcategory"
          className="min-w-0 flex-[1_1_10rem]"
        >
          <FilterSelect
            id="tcategory"
            name="category"
            defaultValue={f.category ?? ""}
            options={options.category}
          />
        </Field>
        <Field label="Status" htmlFor="tstatus" className="min-w-0 flex-[1_1_10rem]">
          <FilterSelect id="tstatus" name="status" defaultValue={f.status ?? ""} options={options.status} />
        </Field>
        {showQa ? (
          <Field label="QA tester" htmlFor="treporter" className="min-w-0 flex-[1_1_10.5rem]">
            <FilterSelect id="treporter" name="reporter" defaultValue={f.reporter ?? ""} options={options.reporter} />
          </Field>
        ) : null}
        {/* A developer's own tabs are already "assigned to me"; on the All tab they can pick anyone. */}
        {showDev ? (
          <Field label="Developer" htmlFor="tassignee" className="min-w-0 flex-[1_1_10.5rem]">
            <FilterSelect id="tassignee" name="assignee" defaultValue={f.assignee ?? ""} options={options.assignee} />
          </Field>
        ) : null}
        {/* The less used ones fold away, and stay open while one is set. */}
        <details open={moreSet > 0} className="basis-full">
          <summary className="w-fit cursor-pointer text-[0.8125rem] font-medium text-primary-text select-none hover:underline">
            More filters{moreSet ? ` (${moreSet})` : ""}
          </summary>
          <div className="mt-2.5 flex flex-wrap items-end gap-2.5">
            <Field label="Severity" htmlFor="tseverity" className="min-w-0 flex-[1_1_10rem]">
              <FilterSelect id="tseverity" name="severity" defaultValue={f.severity ?? ""} options={options.severity} />
            </Field>
            <Field label="Priority" htmlFor="tpriority" className="min-w-0 flex-[1_1_10rem]">
              <FilterSelect id="tpriority" name="priority" defaultValue={f.priority ?? ""} options={options.priority} />
            </Field>
            <Field label="Filed from" htmlFor="tfrom" className="min-w-0 flex-[1_1_10rem]">
              <FilterDate id="tfrom" name="from" defaultValue={f.from ?? ""} max={f.to ?? undefined} />
            </Field>
            <Field label="Filed to" htmlFor="tto" className="min-w-0 flex-[1_1_10rem]">
              <FilterDate id="tto" name="to" defaultValue={f.to ?? ""} min={f.from ?? undefined} />
            </Field>
          </div>
        </details>
        {/* Needed so Enter in Search submits the form; visible when a keyboard reaches it. */}
        <Button
          type="submit"
          variant="outline"
          className="sr-only focus-visible:not-sr-only"
        >
          Apply filters
        </Button>
        {filtered ? (
          <Button
            variant="ghost"
            nativeButton={false}
            render={<Link href={clearHref} />}
          >
            Clear
          </Button>
        ) : null}
      </Card>
    </form>
  );
}
