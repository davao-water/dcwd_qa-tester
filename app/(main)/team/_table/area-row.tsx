import type { Role } from "@/lib/auth/permissions";
import { cn } from "@/lib/utils";

/** `asDesigner`: works on this area as its UI/UX designer (set per area in Members). */
export type Member = { userId: string; name: string; role: Role; designer: boolean; isLead: boolean; asDesigner: boolean };

/** The table head, as on the board: uppercase on the table-head colour. Sticks to the top while rows scroll. */
export const HEAD = "sticky top-0 z-1 h-[3.125rem] bg-table-head px-3.5 text-left align-middle text-[0.7813rem] font-semibold tracking-[0.05em] text-navy uppercase first:rounded-l-lg last:rounded-r-lg";

/** One row of the owners table: the area (name, code under it), then who leads it, the developers, QA and designers. */
export function AreaRow({
  label,
  code,
  muted,
  depth = 0,
  hidden,
  members,
  person,
  admin,
  actions,
}: {
  label: string;
  code?: string | null;
  /** 1 for a sub-module, 2 for one inside a sub-module: indented with a branch line. */
  depth?: number;
  muted?: boolean;
  hidden?: boolean;
  members: Member[];
  person: string;
  admin: boolean;
  actions?: React.ReactNode;
}) {
  const lead = members.filter((m) => m.isLead);
  // Someone marked UI/UX for this area (in Members) is listed under UI/UX instead of their role's column.
  const devs = members.filter((m) => !m.isLead && !m.asDesigner && m.role !== "QA");
  const qa = members.filter((m) => !m.isLead && !m.asDesigner && m.role === "QA");
  const design = members.filter((m) => !m.isLead && m.asDesigner);
  const cell = "border-b border-line2 px-3.5 py-2.5 align-middle";
  return (
    <tr className={cn("transition-colors hover:bg-row-hover", hidden && "opacity-60")}>
      <td className={cn(cell, "h-[3.625rem]", muted ? "text-muted-foreground" : "font-medium text-foreground")}>
        <div className={cn("relative", depth > 1 && "pl-6")}>
          {depth > 1 ? <span aria-hidden className="absolute top-0 left-1.5 h-3 w-3 rounded-bl-md border-b border-l border-input" /> : null}
          {label}
          {hidden ? <span className="ml-2 text-[0.75rem] font-normal text-muted-foreground">(hidden)</span> : null}
          {code ? <span className="block font-mono text-[0.7813rem] font-normal text-muted-foreground">{code}</span> : null}
        </div>
      </td>
      <td className={cell}><People list={lead} person={person} /></td>
      <td className={cell}><People list={devs} person={person} /></td>
      <td className={cell}><People list={qa} person={person} /></td>
      <td className={cell}><People list={design} person={person} /></td>
      {admin ? <td className={cell}><div className="flex justify-end gap-0.5">{actions}</div></td> : null}
    </tr>
  );
}

/** People as grey chips; the person chosen in "Show modules for" turns blue. An empty cell says "None". */
function People({ list, person }: { list: Member[]; person: string }) {
  if (list.length === 0) return <span className="text-muted-foreground">None</span>;
  return (
    <span className="flex flex-wrap gap-1.5">
      {list.map((m) => (
        <span
          key={m.userId}
          // The chosen person stands out in the accent colour, with words for screen readers too.
          className={cn("inline-flex h-6 items-center rounded-full px-2.5 text-[0.8125rem] font-medium", m.userId === person ? "bg-acc text-primary-foreground" : "bg-surface3 text-body2")}
          title={m.asDesigner && m.isLead ? `${m.name} · UI/UX` : undefined}
        >
          {m.name}
          {m.userId === person ? <span className="sr-only"> (selected)</span> : null}
          {/* Outside the Lead column a designer is already under UI/UX; a lead who designs keeps the tag. */}
          {m.asDesigner && m.isLead ? <span className="ml-1 text-[0.6875rem] font-semibold opacity-70">UI/UX</span> : null}
        </span>
      ))}
    </span>
  );
}
