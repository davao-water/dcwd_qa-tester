import { moduleOptions } from "@/lib/areas/tree";
import type { Actor } from "@/lib/tickets/workflow";
import type { TicketFilters } from "@/lib/schemas/ticket";
import { PRIORITIES, PRIORITY_LABELS, SEVERITIES, SEVERITY_LABELS, TICKET_STATUSES, TO_START } from "@/lib/tickets/workflow";
import {
  STATUS_LABELS,
  TICKET_TYPES,
  TYPE_LABELS,
  CATEGORY_LABELS,
  NO_CATEGORY,
  TICKET_CATEGORIES,
} from "@/lib/tickets/workflow";
import type { reporterOptions, ticketFormOptions } from "@/lib/tickets/form-options";

type FormOptions = Awaited<ReturnType<typeof ticketFormOptions>>;
type Reporters = Awaited<ReturnType<typeof reporterOptions>>;

/** The choices in every filter field on the tickets list. */
export function filterOptions(me: Actor, areas: FormOptions["areas"], people: FormOptions["people"], reporters: Reporters) {
  return {
    type: [
      { value: "", label: "All types" },
      ...TICKET_TYPES.map((t) => ({ value: t, label: TYPE_LABELS[t] })),
    ],
    area: [
      { options: [{ value: "", label: "All modules" }] },
      ...moduleOptions(areas, "all"),
    ],
    category: [
      { value: "", label: "All categories" },
      ...TICKET_CATEGORIES.map((c) => ({
        value: c,
        label: CATEGORY_LABELS[c],
      })),
      { value: "none", label: NO_CATEGORY },
    ],
    assignee: [
      { value: "", label: "Any developer" },
      ...(me.role === "ADMIN" ? [{ value: "me", label: "Me" }] : []),
      { value: "none", label: "Not assigned" },
      ...people.map((p) => ({ value: p.id, label: p.name })),
    ],
    reporter: [
      { value: "", label: "Any QA tester" },
      ...(me.role !== "DEV" ? [{ value: "me", label: "Me" }] : []),
      ...reporters.filter((p) => p.id !== me.id).map((p) => ({ value: p.id, label: p.active ? p.name : `${p.name} (inactive)` })),
    ],
    status: [
      { value: "", label: "Any status" },
      { value: TO_START, label: "Not started (new or reopened)" },
      ...TICKET_STATUSES.map((st) => ({ value: st, label: STATUS_LABELS[st] })),
    ],
    severity: [{ value: "", label: "Any severity" }, ...SEVERITIES.map((v) => ({ value: v, label: SEVERITY_LABELS[v] }))],
    priority: [{ value: "", label: "Any priority" }, ...PRIORITIES.map((v) => ({ value: v, label: PRIORITY_LABELS[v] }))],
  };
}

export type FilterOptions = ReturnType<typeof filterOptions>;

/** What every filter form needs to know. */
export type FilterFormProps = {
  f: TicketFilters;
  options: FilterOptions;
  /** Whether the QA tester and developer pickers are shown. */
  showQa: boolean;
  showDev: boolean;
  /** Rebuilds the forms when the address changes (see the tickets page). */
  formKey: string;
  clearHref: string;
};
