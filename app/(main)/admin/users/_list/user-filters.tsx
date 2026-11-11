import Link from "next/link";
import { SearchIcon } from "lucide-react";
import { FilterSelect } from "@/components/filter-select";
import { Field } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ROLE_LABELS, ROLES } from "@/lib/auth/permissions";
import { STATUS_LABELS, type UserFilters as Filters, type UserStatus } from "@/lib/users/filter";

/**
 * The search, Role, Module and Status filters above the Users table. `moduleNames`: every top-level module someone is
 * in. `filtered`: a filter is on, so Clear shows.
 */
export function UserFilters({ f, moduleNames, filtered }: { f: Filters; moduleNames: string[]; filtered: boolean }) {
  return (
    // A choice applies at once; search applies on Enter. It stays a plain GET form.
    <form action="/admin/users" aria-label="Filter users">
      <Card className="flex-row flex-wrap items-end gap-2.5 p-4">
        <Field label="Search" htmlFor="uq" className="min-w-0 flex-[2_1_18.75rem]">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input id="uq" type="search" name="q" defaultValue={f.q} enterKeyHint="search" placeholder="Search nickname or email" className="pl-9" />
          </div>
        </Field>
        <Field label="Role" htmlFor="urole" className="min-w-0 flex-[1_1_9.5rem]">
          <FilterSelect id="urole" name="role" defaultValue={f.role} options={[{ value: "", label: "All roles" }, ...ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))]} />
        </Field>
        <Field label="Module" htmlFor="umodule" className="min-w-0 flex-[1_1_11rem]">
          <FilterSelect
            id="umodule"
            name="module"
            defaultValue={f.module}
            options={[{ value: "", label: "All modules" }, ...moduleNames.map((m) => ({ value: m, label: m })), { value: "none", label: "No module" }]}
          />
        </Field>
        <Field label="Status" htmlFor="ustatus" className="min-w-0 flex-[1_1_11rem]">
          <FilterSelect
            id="ustatus"
            name="status"
            defaultValue={f.status}
            options={[{ value: "", label: "All statuses" }, ...(Object.keys(STATUS_LABELS) as UserStatus[]).map((s) => ({ value: s, label: STATUS_LABELS[s] }))]}
          />
        </Field>
        <Button type="submit" variant="outline" className="sr-only focus-visible:not-sr-only">Apply filters</Button>
        {filtered ? (
          <Button variant="ghost" nativeButton={false} render={<Link href="/admin/users" />}>
            Clear
          </Button>
        ) : null}
      </Card>
    </form>
  );
}
