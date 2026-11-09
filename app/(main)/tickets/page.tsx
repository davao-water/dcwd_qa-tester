import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  FileBarChartIcon,
  MessageSquareIcon,
  PlusIcon,
  SearchIcon,
  TicketIcon,
} from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Field } from "@/components/form-field";
import { SelectField } from "@/components/select-field";
import { InlineAlert } from "@/components/inline-alert";
import { PageHeader } from "@/components/page-header";
import { TicketListSkeleton } from "@/components/skeletons";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { areaPath } from "@/lib/areas/tree";
import { moduleOptions } from "@/lib/areas/tree";
import { can, type Role } from "@/lib/auth/permissions";
import { requireAction } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatDateTime, shortAgo, timeAgo } from "@/lib/format";
import { ticketFilters, type TicketFilters } from "@/lib/schemas/ticket";
import { PRIORITIES, PRIORITY_LABELS, SEVERITIES, SEVERITY_LABELS, TICKET_STATUSES, TO_START } from "@/lib/tickets/workflow";
import {
  columnInView,
  TICKETS_VIEW_COOKIE,
  type BoardColumnKey,
  type TicketView,
} from "@/lib/tickets/board";
import { notificationStore } from "@/lib/tickets/notifications";
import { pageList } from "@/lib/tickets/pager";
import {
  PAGE_SIZE,
  ticketStore,
  type TicketListRow,
  type ViewPatch,
} from "@/lib/tickets/store";
import {
  allowedTransitions,
  canAssign,
  canAssignTicket,
  isDone,
  STATUS_LABELS,
  TICKET_TYPES,
  TYPE_LABELS,
  type Actor,
  type SeverityValue,
  CATEGORY_LABELS,
  NO_CATEGORY,
  TICKET_CATEGORIES,
} from "@/lib/tickets/workflow";
import { cn } from "@/lib/utils";
import { TicketBoard, type BoardCard } from "./board";
import { FilterDate } from "@/components/filter-date";
import { FilterSelect } from "@/components/filter-select";
import { FilterSheet } from "./filter-sheet";
import { reporterOptions, ticketFormOptions } from "./options";
import {
  levelDot,
  levelName,
  TicketStatusPill,
  TicketTypeLabel,
  typeStyle,
  UnreadDot,
} from "./ticket-bits";
import { PhoneTicketGroups } from "./ticket-card";
import { PeekLink } from "./ticket-peek";
import { ViewSwitch } from "./view-switch";

export const metadata: Metadata = { title: "Tickets" };

const tickets = ticketStore(db);
const notifications = notificationStore(db);

export default function TicketsPage({ searchParams }: PageProps<"/tickets">) {
  // The header depends on who is signed in (what they see, whether they may file), so it renders inside the guard.
  return (
    <Suspense fallback={<TicketListSkeleton header />}>
      <TicketList searchParams={searchParams} />
    </Suspense>
  );
}

/** What the All tab says: it is the one tab with everyone's tickets. */
const ALL_TEXT = "Every ticket from every QA tester, with the developer assigned. Open any of them to read it and reply.";

const SCOPE_TEXT: Record<Role, string> = {
  ADMIN: "Every ticket from every QA tester, with the conversation for each.",
  QA: "The tickets you filed. The All tab has every QA tester's tickets.",
  DEV: "The tickets assigned to you. Fix them here and talk them through with the QA tester who filed them. The All tab has every ticket.",
};

/** The printable module report (Print or Save as PDF), in a new tab. */
function ReportButton() {
  return (
    <Button variant="outline" nativeButton={false} render={<a href="/tickets/report" target="_blank" rel="noopener" />}>
      <FileBarChartIcon /> <span className="max-sm:sr-only">Module report</span>
    </Button>
  );
}

function NewTicketButton() {
  return (
    <Button nativeButton={false} render={<Link href="/tickets/new" />}>
      <PlusIcon /> New ticket
    </Button>
  );
}

/** Builds a /tickets URL from the current filters with some of them changed. Page resets unless given. */
function hrefWith(
  f: TicketFilters,
  patch: Partial<Record<keyof TicketFilters, string | number | null>>,
): string {
  const merged: Record<string, string | number | null> = {
    ...f,
    page: null,
    ...patch,
  };
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) {
    if (
      v === null ||
      v === "" ||
      (k === "group" && v === "open") ||
      (k === "page" && v === 1)
    )
      continue;
    qs.set(k, String(v));
  }
  const s = qs.toString();
  return s ? `/tickets?${s}` : "/tickets";
}

type Quick = {
  label: string;
  patch: {
    group: string;
    status: string | null;
    assignee: string | null;
    reporter: string | null;
  };
};
const quick = (
  label: string,
  group: string,
  status: string | null = null,
  assignee: string | null = null,
  reporter: string | null = null,
): Quick => ({
  label,
  patch: { group, status, assignee, reporter },
});

/**
 * Everyone's list is already limited to their own tickets, so these only split it by stage. Admins also get "mine".
 * The board has the same views: it lays out the same tickets by stage.
 */
function quickViews(role: Role): Quick[] {
  const stages = [
    quick("Needs info", "open", "NEED_INFO"),
    quick("Waiting for retest", "open", "FIXED"),
    quick("Done", "done"),
    quick("All", "all"),
  ];
  if (role === "ADMIN")
    return [
      quick("Open", "open"),
      quick("Assigned to me", "open", null, "me"),
      quick("Reported by me", "open", null, null, "me"),
      ...stages,
    ];
  return [
    quick(role === "DEV" ? "Assigned to me" : "My open tickets", "open"),
    ...stages,
  ];
}

/** The 50 px table head row, as on the board: uppercase, on the table-head colour. Sticks to the top while rows scroll. */
const HEAD =
  "sticky top-0 z-1 h-[3.125rem] bg-table-head px-4 text-left align-middle text-[0.7813rem] font-semibold tracking-[0.05em] text-navy uppercase first:rounded-l-lg last:rounded-r-lg";

async function TicketList({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  await connection();
  const me = await requireAction("tickets.view");
  const parsed = ticketFilters.parse(sp);
  // The address picks the list or the board; otherwise it's the one last picked in this browser.
  const saved: TicketView =
    (await cookies()).get(TICKETS_VIEW_COOKIE)?.value === "board"
      ? "board"
      : "list";
  const view: TicketView = parsed.view ?? saved;
  // Links on the page name the view only when it isn't the remembered one, so filtering never switches it.
  const f: TicketFilters = { ...parsed, view: view === saved ? null : view };
  const devFilter = f.assignee && f.assignee !== "me" ? f.assignee : null;
  const qaFilter = f.reporter && f.reporter !== "me" ? f.reporter : null;
  const allTab = f.group === "all";
  // A tab sets its own stage and people; a developer or QA tester chosen in the filters stays on across tabs, unless the
  // tab is "mine". Outside the All tab a tester's or developer's list is their own, so only the All tab keeps someone of
  // their own kind (another tester, another developer).
  const keeps = (group: string, role: Role) => me.role === "ADMIN" || me.role !== role || group === "all";
  const QUICK = quickViews(me.role).map((v) => ({
    ...v,
    patch: {
      ...v.patch,
      assignee: v.patch.assignee ?? (keeps(v.patch.group, "DEV") ? devFilter : null),
      reporter: v.patch.reporter ?? (keeps(v.patch.group, "QA") ? qaFilter : null),
    },
  }));
  const deleted =
    typeof sp.deleted === "string" && /^\d+$/.test(sp.deleted)
      ? sp.deleted
      : null;

  const [list, board, { areas, people }, viewCounts, reporters] = await Promise.all([
    view === "list" ? tickets.list(f, me) : null,
    view === "board" ? tickets.board(f, me) : null,
    ticketFormOptions(),
    tickets.viewCounts(
      f,
      me,
      QUICK.map((v) => v.patch as ViewPatch),
    ),
    reporterOptions(),
  ]);
  const rows = list?.rows ?? [];
  const total = list
    ? list.total
    : (board ?? []).reduce((n, c) => n + c.total, 0);
  const unread = await notifications.unreadIds(
    me,
    (board ? board.flatMap((c) => c.rows) : rows).map((t) => t.id),
  );
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const now = new Date();
  const isQuick = (p: Quick["patch"]) =>
    f.group === p.group &&
    f.status === p.status &&
    f.assignee === p.assignee &&
    f.reporter === p.reporter;
  const moreSet = [f.severity, f.priority, f.from, f.to].filter(Boolean).length;
  const filtered = !!(f.type || f.area || f.category || f.q || f.status || devFilter || qaFilter || moreSet);
  // Picking people: admins always; testers and developers on the All tab, where others' tickets are.
  const showDev = me.role !== "DEV" || allTab;
  const showQa = me.role === "ADMIN" || allTab;
  const canFile = can(me, "tickets.create");

  const options = {
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
  // The view the list is in (list or board, stage, reporter) rides along when the filters are applied.
  const keep = (
    <>
      {f.view ? <input type="hidden" name="view" value={f.view} /> : null}
      {f.group !== "open" ? (
        <input type="hidden" name="group" value={f.group} />
      ) : null}
      {/* "Reported by me" is a tab where the QA tester filter isn't shown: it rides along. */}
      {f.reporter && !showQa ? <input type="hidden" name="reporter" value={f.reporter} /> : null}
    </>
  );
  const clearHref = hrefWith(f, {
    q: null,
    type: null,
    area: null,
    category: null,
    status: null,
    severity: null,
    priority: null,
    from: null,
    to: null,
    assignee: f.assignee === "me" ? "me" : null,
    reporter: f.reporter === "me" ? "me" : null,
  });
  const activeFilters = [f.type, f.area, f.category, f.status, devFilter, qaFilter].filter(Boolean).length + moreSet;
  // The phone sheet: every filter, one under the other.
  const sheetFields = (
    <>
      {keep}
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
    </>
  );
  // Switching keeps the view and every filter; only the list's page number resets.
  const viewHrefs = {
    list: hrefWith(f, { view: "list" }),
    board: hrefWith(f, { view: "board" }),
  };

  return (
    // Big screens (D21): the page fits the window. The header, tabs and filters keep their height; the list or board takes
    // the rest and scrolls inside.
    <div className="grid gap-6 desk:flex desk:h-[calc(100dvh-12.5rem)] desk:min-h-112 desk:flex-col">
      <PageHeader
        title={me.role === "ADMIN" || allTab ? "All tickets" : "My tickets"}
        description={allTab ? ALL_TEXT : SCOPE_TEXT[me.role]}
        actions={
          <div className="flex items-center gap-3">
            <ViewSwitch view={view} hrefs={viewHrefs} />
            <ReportButton />
            {canFile ? (
              <span className="max-md:hidden">
                <NewTicketButton />
              </span>
            ) : null}
            <span className="md:hidden">
              <FilterSheet active={activeFilters}>
                <form action="/tickets" className="grid gap-4">
                  {sheetFields}
                </form>
              </FilterSheet>
            </span>
          </div>
        }
      />
      {deleted ? (
        <InlineAlert tone="ok" role="status">
          Ticket #{deleted} was deleted permanently.
        </InlineAlert>
      ) : null}

      {/* Phones: the filters button and one search field; the rest of the filters are in the sheet. */}
      <div className="flex items-center gap-2 md:hidden">
        <FilterSheet active={activeFilters}>
          <form action="/tickets" className="grid gap-4">
            {sheetFields}
          </form>
        </FilterSheet>
        <form
          action="/tickets"
          role="search"
          className="relative min-w-0 flex-1"
        >
          {keep}
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
      </div>

      {/* The views. Phones: chips that scroll sideways. Laptops: underline tabs with a count, as on the board. */}
      <nav
        aria-label="Ticket views"
        className="flex gap-1.5 max-md:-mx-5 max-md:gap-2 max-md:overflow-x-auto max-md:px-5 max-md:[scrollbar-width:none] md:gap-1 md:overflow-x-auto md:overflow-y-hidden md:border-b md:border-line"
      >
        {QUICK.map((v, i) => {
          const on = isQuick(v.patch);
          return (
            <Link
              key={v.label}
              href={hrefWith(f, v.patch)}
              aria-current={on ? "page" : undefined}
              className={cn(
                "flex shrink-0 items-center gap-2 font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                // Phones
                "max-md:h-9 max-md:rounded-full max-md:px-4 max-md:text-sm",
                on
                  ? "max-md:bg-acc max-md:text-primary-foreground"
                  : "max-md:bg-card max-md:text-ink2 max-md:shadow-[0_0.0625rem_0.125rem_rgba(20,22,40,0.06),0_0.125rem_0.5rem_rgba(20,22,40,0.04)]",
                // Laptops
                "md:h-12 md:border-b-2 md:px-4 md:text-[0.9375rem] md:focus-visible:ring-inset",
                on
                  ? "md:border-acc md:text-primary-text"
                  : "md:border-transparent md:text-muted-foreground md:hover:bg-row-hover md:hover:text-foreground",
              )}
            >
              {v.label}
              <span
                className={cn(
                  "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 font-mono text-[0.75rem] tabular-nums max-md:hidden",
                  on ? "bg-acc-t text-acc-ink" : "bg-surface3 text-ink2",
                )}
              >
                {viewCounts[i]}
                <span className="sr-only"> tickets</span>
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Laptops: the filters in a card with visible labels. A choice applies at once; search applies on Enter. It stays a
          plain GET form, so it still works without scripts (the hidden Apply button). */}
      <form
        action="/tickets"
        aria-label="Filter tickets"
        className="max-md:hidden"
      >
        <Card className="flex-row flex-wrap items-end gap-2.5 p-4">
          {keep}
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

      {total === 0 || (list && rows.length === 0) ? (
        <EmptyState
          icon={TicketIcon}
          title={
            total === 0 &&
            !filtered &&
            f.group === "open" &&
            !f.assignee &&
            !f.reporter &&
            !f.status
              ? "No open tickets"
              : "Nothing matches"
          }
          action={
            filtered ? (
              <Button
                variant="outline"
                nativeButton={false}
                render={<Link href={clearHref} />}
              >
                Clear the filters
              </Button>
            ) : canFile ? (
              <NewTicketButton />
            ) : null
          }
        >
          {filtered || f.status || f.assignee || f.reporter
            ? "Try another view or clear the filters."
            : me.role === "DEV"
              ? "Nothing is assigned to you right now. Tickets appear here when a QA tester assigns them to you."
              : "File the first one: a bug, a suggestion or an improvement."}
        </EmptyState>
      ) : board ? (
        <TicketBoard
          columns={board.map((c) => ({
            key: c.key,
            total: c.total,
            cards: c.rows.map((t) => boardCard(t, me, unread.has(t.id), now, allTab)),
            more:
              c.total > c.rows.length
                ? hrefWith(f, { view: "list", ...MORE[c.key] })
                : null,
            inView: columnInView(c.key, f),
          }))}
          assign={canAssign(me) ? { areas, people } : null}
          developers={people.map((p) => ({ id: p.id, name: p.name }))}
        />
      ) : (
        <>
          <PhoneTicketGroups
            tickets={rows.map((t) => ({
              ...t,
              person: allTab
                ? `${t.reporter.name} → ${t.assignee?.name ?? "not assigned"}`
                : me.role === "DEV"
                  ? `from ${t.reporter.name}`
                  : (t.assignee?.name ?? "Not assigned"),
            }))}
            unread={unread}
            now={now}
          />
          {/* Laptops: the board's table. Big screens: the rows scroll inside the card under a sticky head, the pager stays below. */}
          <Card className="p-4 max-md:hidden desk:min-h-0 desk:flex-1">
            <div className="overflow-x-auto desk:min-h-0 desk:flex-1 desk:overflow-y-auto desk:overscroll-contain">
              <table className="w-full min-w-[47.5rem] border-separate border-spacing-0 text-sm">
                <thead>
                  <tr>
                    <th scope="col" className={cn(HEAD, "w-[4.75rem]")}>
                      No.
                    </th>
                    <th scope="col" className={HEAD}>
                      Ticket
                    </th>
                    <th scope="col" className={cn(HEAD, "w-32")}>
                      Status
                    </th>
                    <th scope="col" className={cn(HEAD, "w-[9.375rem]")}>
                      Developer
                    </th>
                    <th
                      scope="col"
                      className={cn(HEAD, "w-[5.75rem] text-right")}
                    >
                      Activity
                    </th>
                  </tr>
                </thead>
                <tbody className="stagger">
                  {rows.map((t) => {
                    const level =
                      (t.severity as SeverityValue | null) ?? t.priority;
                    const isUnread = unread.has(t.id);
                    return (
                      <tr
                        key={t.id}
                        className="relative transition-colors hover:bg-row-hover [&>td]:border-b [&>td]:border-line2 last:[&>td]:border-b-0"
                      >
                        <td
                          className={cn(
                            "h-14 px-4 align-middle font-mono text-[0.8125rem] text-muted-foreground",
                            typeStyle(t.type).stripe,
                          )}
                        >
                          <span className="inline-flex items-center gap-2">
                            {t.number}
                            {isUnread ? <UnreadDot /> : null}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 align-middle">
                          <PeekLink
                            number={t.number}
                            className={cn(
                              isUnread ? "font-semibold" : "font-medium",
                              "text-[0.9063rem] after:absolute after:inset-0 hover:text-primary-text hover:underline",
                            )}
                          >
                            {t.title}
                          </PeekLink>
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.8125rem] text-muted-foreground">
                            <TicketTypeLabel
                              type={t.type}
                              className="border-transparent bg-transparent px-0"
                            />
                            <span className="inline-flex items-center gap-1.5">
                              <span
                                className={cn(
                                  "size-2 rounded-full",
                                  levelDot(level),
                                )}
                                aria-hidden
                              />
                              {levelName(level)}
                            </span>
                            <span>
                              {t.category
                                ? CATEGORY_LABELS[t.category]
                                : NO_CATEGORY}
                            </span>
                            {t.area ? <span>{areaPath(t.area)}</span> : null}
                            {me.role !== "QA" || allTab ? (
                              <span>by {t.reporter.name}</span>
                            ) : null}
                            {t._count.comments ? (
                              <span className="inline-flex items-center gap-1">
                                <MessageSquareIcon
                                  className="size-3.5"
                                  aria-hidden
                                />
                                <span className="font-mono">
                                  {t._count.comments}
                                </span>
                                <span className="sr-only">
                                  {" "}
                                  repl{t._count.comments === 1 ? "y" : "ies"}
                                </span>
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-4 align-middle">
                          <TicketStatusPill status={t.status} />
                        </td>
                        <td
                          className={cn(
                            "max-w-[9.375rem] px-4 align-middle text-[0.875rem]",
                            !t.assignee && "text-muted-foreground",
                          )}
                        >
                          <span
                            className="block truncate"
                            title={t.assignee?.name}
                          >
                            {t.assignee?.name ?? "Not assigned"}
                          </span>
                        </td>
                        <td
                          className="px-4 text-right align-middle text-[0.8125rem] text-muted-foreground"
                          title={formatDateTime(t.lastActivityAt)}
                        >
                          {shortAgo(t.lastActivityAt, now)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pager f={f} total={total} pages={pages} />
          </Card>
          {/* Phones: the count and the pager under the cards. */}
          <div className="md:hidden">
            <Pager f={f} total={total} pages={pages} />
          </div>
        </>
      )}

      {/* Phones: New ticket floats above the tab bar, in thumb reach. */}
      {canFile ? (
        <Link
          href="/tickets/new"
          className="fixed right-5 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-20 flex h-14 items-center gap-2 rounded-[1.125rem] bg-acc pr-5 pl-4 text-[0.9375rem] font-semibold text-primary-foreground shadow-[0_0.625rem_1.5rem_color-mix(in_srgb,var(--acc)_40%,transparent)] outline-none focus-visible:ring-3 focus-visible:ring-acc/40 active:scale-95 md:hidden"
        >
          <PlusIcon className="size-5" aria-hidden /> New ticket
        </Link>
      ) : null}
    </div>
  );
}

/** "{n} tickets" and the numbered pages (‹ 1 … 4 5 6 … 12 ›). The numbers are hidden when everything fits on one page. */
function Pager({
  f,
  total,
  pages,
}: {
  f: TicketFilters;
  total: number;
  pages: number;
}) {
  const page = Math.min(f.page, pages);
  const box =
    "flex size-9 items-center justify-center rounded-lg border border-line text-sm font-medium tabular-nums transition-colors";
  return (
    <div className="flex min-h-15 flex-wrap items-center justify-between gap-3 pt-3 text-[0.8125rem] text-muted-foreground">
      <span>
        {total} ticket{total === 1 ? "" : "s"}
      </span>
      {/* Phones keep Previous and Next (D1): numbered pages don't fit a narrow screen. */}
      {pages > 1 ? (
        <span className="flex items-center gap-1.5 md:hidden">
          <span className="mr-1">
            Page {page} of {pages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            nativeButton={false}
            render={
              <Link
                href={hrefWith(f, { page: page - 1 })}
                aria-disabled={page <= 1}
              />
            }
          >
            <ChevronLeftIcon /> Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= pages}
            nativeButton={false}
            render={
              <Link
                href={hrefWith(f, { page: page + 1 })}
                aria-disabled={page >= pages}
              />
            }
          >
            Next <ChevronRightIcon />
          </Button>
        </span>
      ) : null}
      {pages > 1 ? (
        <nav
          aria-label="Pages"
          className="flex items-center gap-1.5 max-md:hidden"
        >
          {page > 1 ? (
            <Link
              href={hrefWith(f, { page: page - 1 })}
              aria-label="Previous page"
              className={cn(box, "text-foreground hover:bg-row-hover")}
            >
              <ChevronLeftIcon className="size-4" aria-hidden />
            </Link>
          ) : (
            <span aria-hidden className={cn(box, "opacity-40")}>
              <ChevronLeftIcon className="size-4" />
            </span>
          )}
          {pageList(page, pages).map((n, i) =>
            n === "gap" ? (
              <span key={`gap-${i}`} aria-hidden className="w-6 text-center">
                …
              </span>
            ) : (
              <Link
                key={n}
                href={hrefWith(f, { page: n })}
                aria-current={n === page ? "page" : undefined}
                aria-label={`Page ${n}`}
                className={cn(
                  box,
                  n === page
                    ? "border-acc bg-acc text-primary-foreground"
                    : "text-foreground hover:bg-row-hover",
                )}
              >
                {n}
              </Link>
            ),
          )}
          {page < pages ? (
            <Link
              href={hrefWith(f, { page: page + 1 })}
              aria-label="Next page"
              className={cn(box, "text-foreground hover:bg-row-hover")}
            >
              <ChevronRightIcon className="size-4" aria-hidden />
            </Link>
          ) : (
            <span aria-hidden className={cn(box, "opacity-40")}>
              <ChevronRightIcon className="size-4" />
            </span>
          )}
        </nav>
      ) : null}
    </div>
  );
}

/** Where a full column's "See all in the list" goes: that stage in the list. */
const MORE: Record<BoardColumnKey, { group: string; status: string | null }> = {
  todo: { group: "open", status: null },
  doing: { group: "open", status: "IN_PROGRESS" },
  info: { group: "open", status: "NEED_INFO" },
  fixed: { group: "open", status: "FIXED" },
  done: { group: "done", status: null },
};

/** A ticket as a card on the board, with what the viewer may do to it. A developer's cards name who filed it. */
function boardCard(
  t: TicketListRow,
  me: Actor,
  unread: boolean,
  now: Date,
  allTab: boolean,
): BoardCard {
  return {
    id: t.id,
    number: t.number,
    type: t.type,
    title: t.title,
    status: t.status,
    severity: t.severity as SeverityValue | null,
    priority: t.priority,
    area: t.area ? areaPath(t.area) : null,
    areaId: t.areaId,
    comments: t._count.comments,
    ago: timeAgo(t.lastActivityAt, now),
    at: t.lastActivityAt.toISOString(),
    atLabel: `Last activity ${formatDateTime(t.lastActivityAt)}`,
    // On the All tab a tester sees others' tickets, so their cards name who filed them; developers always see that.
    person:
      me.role === "DEV" || (allTab && t.reporter.id !== me.id)
        ? { role: "Filed by", name: t.reporter.name }
        : { role: "Developer", name: t.assignee?.name ?? null },
    assigneeId: t.assignee?.id ?? null,
    unread,
    moves: allowedTransitions(
      {
        status: t.status,
        reporterId: t.reporter.id,
        assigneeId: t.assignee?.id ?? null,
      },
      me,
    ),
    canAssign: canAssignTicket({ status: t.status, reporterId: t.reporter.id, assigneeId: t.assignee?.id ?? null }, me) && !isDone(t.status),
  };
}
