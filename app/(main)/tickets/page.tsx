import type { Metadata } from "next";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { Suspense } from "react";
import { InlineAlert } from "@/components/inline-alert";
import { PageHeader } from "@/components/page-header";
import { TicketListSkeleton } from "@/components/skeletons";
import { can, type Role } from "@/lib/auth/permissions";
import { requireAction } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { ticketFilters, type TicketFilters } from "@/lib/schemas/ticket";
import { TICKETS_VIEW_COOKIE, type TicketView } from "@/lib/tickets/board";
import { notificationStore } from "@/lib/tickets/notifications";
import { PAGE_SIZE, ticketStore, type ViewPatch } from "@/lib/tickets/store";
import { canAssign } from "@/lib/tickets/workflow";
import { TicketBoard } from "./board";
import { PhoneTicketGroups } from "@/components/ticket-card";
import { reporterOptions, ticketFormOptions } from "@/lib/tickets/form-options";
import { ViewSwitch } from "./view-switch";
import { boardColumns } from "./_list/board-columns";
import { DeskFilters } from "./_list/desk-filters";
import { EmptyList } from "./_list/empty-list";
import { filterOptions, type FilterFormProps } from "./_list/filter-options";
import { hrefWith } from "./_list/href";
import { NewTicketButton, NewTicketFab, ReportButton } from "./_list/new-ticket-buttons";
import { Pager } from "./_list/pager";
import { PhoneFilterSheet } from "./_list/phone-filter-sheet";
import { PhoneSearch } from "./_list/phone-search";
import { quickViews } from "./_list/quick-views";
import { TicketTable } from "./_list/ticket-table";
import { ViewTabs } from "./_list/view-tabs";

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
    ticketFormOptions(db),
    tickets.viewCounts(
      f,
      me,
      QUICK.map((v) => v.patch as ViewPatch),
    ),
    reporterOptions(db),
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
  const moreSet = [f.severity, f.priority, f.from, f.to].filter(Boolean).length;
  const filtered = !!(f.type || f.area || f.category || f.q || f.status || devFilter || qaFilter || moreSet);
  // Picking people: admins always; testers and developers on the All tab, where others' tickets are.
  const showDev = me.role !== "DEV" || allTab;
  const showQa = me.role === "ADMIN" || allTab;
  const canFile = can(me, "tickets.create");

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
  // The filter fields are uncontrolled (defaultValue) and Next keeps this page mounted between visits, so a link that
  // changes the filters (a module on the dashboard, a tab) would leave the old choice showing. A new key per set of
  // filters rebuilds the forms, so every field shows what the address says.
  const formKey = JSON.stringify(f);
  const filterProps: FilterFormProps = {
    f,
    options: filterOptions(me, areas, people, reporters),
    showQa,
    showDev,
    formKey,
    clearHref,
  };
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
              <PhoneFilterSheet active={activeFilters} {...filterProps} />
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
        <PhoneFilterSheet active={activeFilters} {...filterProps} />
        <PhoneSearch f={f} showQa={showQa} formKey={formKey} />
      </div>

      <ViewTabs f={f} views={QUICK} counts={viewCounts} />

      <DeskFilters {...filterProps} moreSet={moreSet} filtered={filtered} />

      {total === 0 || (list && rows.length === 0) ? (
        <EmptyList
          plainView={total === 0 && !filtered && f.group === "open" && !f.assignee && !f.reporter && !f.status}
          filtered={filtered}
          narrowed={!!(filtered || f.status || f.assignee || f.reporter)}
          canFile={canFile}
          clearHref={clearHref}
          role={me.role}
        />
      ) : board ? (
        <TicketBoard
          columns={boardColumns(board, f, me, unread, now, allTab)}
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
          <TicketTable
            rows={rows}
            unread={unread}
            now={now}
            showReporter={me.role !== "QA" || allTab}
            f={f}
            total={total}
            pages={pages}
          />
          {/* Phones: the count and the pager under the cards. */}
          <div className="md:hidden">
            <Pager f={f} total={total} pages={pages} />
          </div>
        </>
      )}

      {canFile ? <NewTicketFab /> : null}
    </div>
  );
}
