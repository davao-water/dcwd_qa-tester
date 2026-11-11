import { MessageCircleQuestionIcon, RotateCcwIcon, TicketIcon, UserCheckIcon } from "lucide-react";
import type { Role } from "@/lib/auth/permissions";
import { areaStore } from "@/lib/areas/store";
import { areaPath } from "@/lib/areas/tree";
import { db } from "@/lib/db";
import { notificationStore } from "@/lib/tickets/notifications";
import { ticketStore } from "@/lib/tickets/store";
import type { Actor } from "@/lib/tickets/workflow";
import { ModuleProgressSection } from "../module-progress";
import { MainAndSide } from "./main-and-side";
import { scopeFor } from "./module-scope";
import { RecentTickets } from "./recent-tickets";
import { SideCard, SideRow } from "./side-card";
import { StatRow, type Stat } from "./stat-row";
import { plural } from "./words";

const tickets = ticketStore(db);
const notifications = notificationStore(db);

/** Whoever files or fixes tickets; an admin has their own Home. */
type WorkRole = Exclude<Role, "ADMIN">;
type Counts = Awaited<ReturnType<typeof tickets.counts>>;

/** What each person needs to act on first. */
const TICKET_STATS: Record<WorkRole, (c: Counts) => Stat[]> = {
  QA: (c) => [
    { label: "My open tickets", value: c.open, href: "/tickets", icon: TicketIcon },
    { label: "Developer needs info", value: c.needInfo, href: "/tickets?status=NEED_INFO", icon: MessageCircleQuestionIcon, note: "answer these", tone: "warn" },
    { label: "Ready for my retest", value: c.fixed, href: "/tickets?status=FIXED", icon: RotateCcwIcon, note: "fixed, verify them", tone: "ok" },
  ],
  DEV: (c) => [
    { label: "Assigned to me", value: c.open, href: "/tickets", icon: UserCheckIcon, note: "open" },
    { label: "Not started", value: c.toStart, href: "/tickets?status=TO_START", icon: TicketIcon, note: "new or reopened", tone: "warn" },
    { label: "Waiting for QA retest", value: c.fixed, href: "/tickets?status=FIXED", icon: RotateCcwIcon, tone: "ok" },
  ],
};

/** Testers and developers see their own work first: their own tickets (QA) or their assignments (DEV). */
export async function workHome(me: { id: string; name: string; role: WorkRole } & Actor, modulesParam: string) {
  const scope = scopeFor(modulesParam, false, []);
  const [counts, recent, myAreas, progress] = await Promise.all([
    tickets.counts(me),
    tickets.recent(me),
    areaStore(db).areasOf(me.id),
    tickets.moduleProgress(scope.value === "mine" ? me.id : undefined),
  ]);
  const unread = await notifications.unreadIds(me, recent.map((t) => t.id));
  const qa = me.role === "QA";
  const waitingCount = qa ? counts.needInfo + counts.fixed : counts.toStart;
  const line = waitingCount
    ? qa
      ? `${waitingCount} ${plural(waitingCount, "ticket is", "tickets are")} waiting for you.`
      : `${waitingCount} ${plural(waitingCount, "ticket has", "tickets have")} not been started.`
    : "No tickets are waiting for you.";
  return {
    line,
    body: (
      <>
        <StatRow stats={TICKET_STATS[me.role](counts)} />
        <MainAndSide>
          <RecentTickets
            rows={recent}
            unread={unread}
            title={qa ? "My tickets" : "My assigned tickets"}
            tip={qa ? "Tickets you filed, most recent activity first." : "Assigned to you, most recent activity first."}
            person={(t) => (qa ? (t.assignee?.name ?? "Not assigned") : `from ${t.reporter.name}`)}
            empty={qa ? "No tickets yet." : "Nothing is assigned to you yet."}
            canFile={qa}
          />
          <SideCard title="My modules" link={{ href: `/team?person=${me.id}`, label: "Directory" }} empty="You aren’t in a module yet. Ask an admin to add you.">
            {myAreas.map((a) => (
              <SideRow key={a.area.id} name={areaPath(a.area)}>
                {a.isLead ? <span className="shrink-0 rounded-full bg-acc-t px-2 py-0.5 text-[0.75rem] font-semibold text-acc-ink">Lead</span> : null}
              </SideRow>
            ))}
          </SideCard>
        </MainAndSide>
        <ModuleProgressSection
          {...progress}
          scope={scope.value}
          options={scope.options}
          linked={false}
          emptyText={progress.total === 0 ? "No modules yet." : "You are not in any module yet."}
          teamLink={false}
        />
      </>
    ),
  };
}
