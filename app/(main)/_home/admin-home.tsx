import { BoxesIcon, CodeIcon, FlaskConicalIcon, TicketIcon } from "lucide-react";
import { ROLE_LABELS, type Role } from "@/lib/auth/permissions";
import type { requireUser } from "@/lib/auth/session";
import { areaStore } from "@/lib/areas/store";
import { db } from "@/lib/db";
import { notificationStore } from "@/lib/tickets/notifications";
import { ticketStore } from "@/lib/tickets/store";
import { ModuleProgressSection } from "../module-progress";
import { MainAndSide } from "./main-and-side";
import { scopeFor } from "./module-scope";
import { RecentTickets } from "./recent-tickets";
import { SideCard, SideRow } from "./side-card";
import { StatRow } from "./stat-row";
import { plural } from "./words";

const tickets = ticketStore(db);
const notifications = notificationStore(db);
const areas = areaStore(db);

type Me = Awaited<ReturnType<typeof requireUser>>;

/** Admins look after people and modules: how big the team and directory are, the newest tickets, and who needs a module. */
export async function adminHome(me: Me, modulesParam: string) {
  const qaTesters = await areas.activeQaTesters();
  const scope = scopeFor(modulesParam, true, qaTesters);
  const [total, devs, { modules, subModules }, newest, unassigned, progress] = await Promise.all([
    tickets.total(me),
    areas.activeDeveloperCount(),
    areas.activeModuleCounts(),
    tickets.recent(me, 6, true),
    areas.peopleWithoutModule(),
    tickets.moduleProgress(scope.forUserId),
  ]);
  const unread = await notifications.unreadIds(me, newest.map((t) => t.id));
  const n = unassigned.length;
  return {
    line: n ? `${n} ${plural(n, "person needs", "people need")} a module.` : "Everyone has a module.",
    body: (
      <>
        <StatRow
          stats={[
            { label: "Total tickets", value: total, href: "/tickets?group=all", icon: TicketIcon },
            { label: "QA testers", value: qaTesters.length, href: "/team", icon: FlaskConicalIcon },
            { label: "Developers", value: devs, href: "/team", icon: CodeIcon },
            { label: "Modules", value: modules, href: "/team", icon: BoxesIcon, note: `${subModules} ${plural(subModules, "sub-module", "sub-modules")}` },
          ]}
        />
        <MainAndSide>
          <RecentTickets
            rows={newest}
            unread={unread}
            title="Newest tickets"
            tip="The latest tickets across all modules."
            person={(t) => t.assignee?.name ?? "Not assigned"}
            empty="No tickets yet."
            byFiled
          />
          <SideCard title="Not in any module" link={{ href: "/team", label: "Assign" }} empty="Everyone has a module.">
            {unassigned.map((u) => (
              <SideRow key={u.id} name={u.name}>
                <span className="shrink-0 text-[0.8125rem] text-muted-foreground">{ROLE_LABELS[u.role as Role]}</span>
              </SideRow>
            ))}
          </SideCard>
        </MainAndSide>
        <ModuleProgressSection
          {...progress}
          scope={scope.value}
          options={scope.options}
          linked
          emptyText={progress.total === 0 ? "No modules yet." : "This QA tester isn't in any active module yet."}
          teamLink={progress.total === 0}
        />
      </>
    ),
  };
}
