import { SearchIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { FilterFormProps } from "./filter-options";
import { KeepFields } from "./keep-fields";

/** Phones: the one search field; every other filter rides along hidden. */
export function PhoneSearch({ f, showQa, formKey }: Pick<FilterFormProps, "f" | "showQa" | "formKey">) {
  return (
    <form
      key={formKey}
      action="/tickets"
      role="search"
      className="relative min-w-0 flex-1"
    >
      <KeepFields f={f} showQa={showQa} />
      {f.type ? <input type="hidden" name="type" value={f.type} /> : null}
      {f.area ? <input type="hidden" name="area" value={f.area} /> : null}
      {f.category ? (
        <input type="hidden" name="category" value={f.category} />
      ) : null}
      {f.assignee ? (
        <input type="hidden" name="assignee" value={f.assignee} />
      ) : null}
      {f.reporter && showQa ? <input type="hidden" name="reporter" value={f.reporter} /> : null}
      {f.status ? <input type="hidden" name="status" value={f.status} /> : null}
      {f.severity ? <input type="hidden" name="severity" value={f.severity} /> : null}
      {f.priority ? <input type="hidden" name="priority" value={f.priority} /> : null}
      {f.from ? <input type="hidden" name="from" value={f.from} /> : null}
      {f.to ? <input type="hidden" name="to" value={f.to} /> : null}
      <SearchIcon
        className="pointer-events-none absolute top-1/2 left-3.5 size-[1.125rem] -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        type="search"
        name="q"
        defaultValue={f.q}
        enterKeyHint="search"
        placeholder="Search tickets or #number"
        aria-label="Search tickets"
        className="h-11 rounded-xl border-transparent pl-10 shadow-[0_0.0625rem_0.125rem_rgba(20,22,40,0.06),0_0.125rem_0.5rem_rgba(20,22,40,0.04)]"
      />
    </form>
  );
}
