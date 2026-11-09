import { AREA_PATH_SELECT, areaPath } from "@/lib/areas/tree";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import {
  ArrowRightIcon,
  BoxesIcon,
  CodeIcon,
  FlaskConicalIcon,
  MessageCircleQuestionIcon,
  PlusIcon,
  RotateCcwIcon,
  TicketIcon,
  UserCheckIcon,
  type LucideIcon,
} from "lucide-react";
import { InfoTip } from "@/components/info-tip";
import { InlineAlert } from "@/components/inline-alert";
import { NotificationBell } from "@/components/notifications-panel";
import { ThemeToggle } from "@/components/theme-toggle";
import { DashboardSkeleton } from "@/components/skeletons";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { can, ROLE_LABELS, type Role } from "@/lib/auth/permissions";
import { auth, requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatLongDate, greeting, shortAgo } from "@/lib/format";
import { notificationStore } from "@/lib/tickets/notifications";
import { ticketStore } from "@/lib/tickets/store";
import type { Actor } from "@/lib/tickets/workflow";
import { cn } from "@/lib/utils";
import { ModuleProgressSection } from "./module-progress";
import { levelDot, levelName, TicketStatusPill, UnreadDot } from "./tickets/ticket-bits";
import { PhoneTicketList } from "./tickets/ticket-card";

const tickets = ticketStore(db);
const notifications = notificationStore(db);

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function DashboardPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Overview searchParams={searchParams} />
    </Suspense>
  );
}

/** Whoever files or fixes tickets; an admin has their own Home. */
type WorkRole = Exclude<Role, "ADMIN">;
type Me = Awaited<ReturnType<typeof requireUser>>;

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

async function Overview({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const me = await requireUser();
  const raw = (await searchParams).modules;
  const modulesParam = (Array.isArray(raw) ? raw[0] : raw) ?? "";
  const now = new Date();
  const { signUps, resets } = can(me, "users.manage") ? await auth.adminRequests() : { signUps: 0, resets: 0 };
  const waiting = [
    signUps ? `${signUps} ${plural(signUps, "sign-up", "sign-ups")}` : null,
    resets ? `${resets} password reset ${plural(resets, "request", "requests")}` : null,
  ].filter(Boolean);

  const home = me.role === "ADMIN" ? await adminHome(me, modulesParam) : await workHome({ ...me, role: me.role }, modulesParam);

  return (
    <div className="grid gap-6 max-md:gap-5">
      {/* Phones keep their own greeting with the bell; laptops get the board's header. */}
      <div className="flex items-end justify-between gap-3 md:hidden">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{formatLongDate(now)}</p>
          <h1 className="truncate text-[2rem] leading-tight font-bold tracking-[-0.025em]">Hi, {firstName(me.name)}</h1>
        </div>
        <div className="flex items-center gap-2.5">
          <ThemeToggle />
          <NotificationBell />
        </div>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-4 max-md:hidden">
        <div className="min-w-0">
          <h1 className="text-[1.75rem] leading-tight font-semibold tracking-[-0.015em]">
            {greeting(now)}, {firstName(me.name)}
          </h1>
          <p className="mt-1.5 text-[0.9063rem] text-muted-foreground">
            {formatLongDate(now)}. {home.line}
          </p>
        </div>
        {can(me, "tickets.create") ? (
          <Button nativeButton={false} render={<Link href="/tickets/new" />}>
            <PlusIcon aria-hidden /> New ticket
          </Button>
        ) : null}
      </div>
      {waiting.length ? (
        <InlineAlert tone="info" role="status">
          {waiting.join(" and ")} {plural(signUps + resets, "is", "are")} waiting for you.{" "}
          <Link href={`/admin/users?tab=${signUps ? "approval" : "reset"}`} className="font-medium underline underline-offset-2">Review requests</Link>
        </InlineAlert>
      ) : null}
      {home.body}
    </div>
  );
}

const firstName = (name: string) => name.split(/\s+/)[0];

/** The modules filter: admins see everything or one QA tester's modules; others their own or everything. */
function scopeFor(param: string, admin: boolean, qaTesters: { id: string; name: string }[]) {
  if (admin) {
    const person = qaTesters.find((u) => u.id === param);
    return {
      value: person ? person.id : "all",
      forUserId: person?.id,
      options: [{ value: "all", label: "All modules" }, ...qaTesters.map((u) => ({ value: u.id, label: u.name }))],
    };
  }
  return { value: param === "all" ? "all" : "mine", forUserId: undefined as string | undefined, options: [{ value: "mine", label: "My modules" }, { value: "all", label: "All modules" }] };
}

/** Admins look after people and modules: how big the team and directory are, the newest tickets, and who needs a module. */
async function adminHome(me: Me, modulesParam: string) {
  const qaTesters = await db.user.findMany({ where: { active: true, role: "QA" }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  const scope = scopeFor(modulesParam, true, qaTesters);
  const [total, devs, modules, subModules, newest, unassigned, progress] = await Promise.all([
    tickets.total(me),
    db.user.count({ where: { active: true, role: "DEV" } }),
    db.erpArea.count({ where: { parentId: null, active: true } }),
    db.erpArea.count({ where: { parentId: { not: null }, active: true } }),
    tickets.recent(me, 6, true),
    db.user.findMany({
      where: { active: true, role: { in: ["DEV", "QA"] }, areas: { none: {} } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, role: true },
    }),
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

/** Testers and developers see their own work first: their own tickets (QA) or their assignments (DEV). */
async function workHome(me: { id: string; name: string; role: WorkRole } & Actor, modulesParam: string) {
  const scope = scopeFor(modulesParam, false, []);
  const [counts, recent, myAreas, progress] = await Promise.all([
    tickets.counts(me),
    tickets.recent(me),
    db.areaMember.findMany({
      where: { userId: me.id },
      select: { isLead: true, area: { select: { id: true, ...AREA_PATH_SELECT } } },
    }),
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

type Stat = { label: string; value: number; href: string; icon: LucideIcon; note?: string; tone?: "warn" | "ok" };
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

const ICON_BOX = { warn: "bg-warn-t text-warn-ink", ok: "bg-ok-t text-ok" } as const;

/** The ticket list beside the modules card; the side card drops under it when they no longer fit. */
function MainAndSide({ children }: { children: [React.ReactNode, React.ReactNode] }) {
  return (
    // Phones put Module progress right under the stats (HANDOFF section 7), so this goes after it there.
    <div className="flex flex-wrap items-start gap-6 max-md:order-2 max-md:gap-5">
      <div className="min-w-0 flex-[999_1_35rem] max-md:basis-full">{children[0]}</div>
      <div className="min-w-0 flex-[1_1_20rem] max-md:basis-full">{children[1]}</div>
    </div>
  );
}

function CardHead({ id, title, tip, link }: { id: string; title: string; tip?: string; link: { href: string; label: string } }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-3.5">
      <div className="flex min-w-0 items-center gap-1.5">
        <h2 id={id} className="truncate text-[1.125rem] font-semibold">{title}</h2>
        {tip ? <InfoTip label={title} text={tip} /> : null}
      </div>
      <Link href={link.href} className="shrink-0 text-sm font-medium text-primary-text hover:text-primary-hover hover:underline">{link.label}</Link>
    </div>
  );
}

function SideCard({ title, link, empty, children }: { title: string; link: { href: string; label: string }; empty: string; children: React.ReactNode[] }) {
  return (
    <Card role="region" aria-labelledby="side-title">
      <CardHead id="side-title" title={title} link={link} />
      {children.length === 0 ? (
        <p className="border-t border-line2 px-5 py-4 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="stagger pb-2">{children}</ul>
      )}
    </Card>
  );
}

function SideRow({ name, children }: { name: string; children?: React.ReactNode }) {
  return (
    <li className="flex min-h-11 items-center justify-between gap-3 border-t border-line2 px-5 py-2 text-sm">
      <span className="min-w-0 truncate font-medium" title={name}>{name}</span>
      {children}
    </li>
  );
}

type Recent = Awaited<ReturnType<typeof tickets.recent>>[number];

function RecentTickets({
  rows,
  unread,
  title,
  tip,
  person,
  empty,
  canFile = false,
  byFiled = false,
}: {
  /** Sorted by when they were filed, so the age column shows that too. */
  byFiled?: boolean;
  rows: Recent[];
  unread: Set<string>;
  title: string;
  tip: string;
  person: (t: Recent) => string;
  empty: string;
  canFile?: boolean;
}) {
  const now = new Date();
  const emptyText = (
    <>
      {empty}{" "}
      {canFile ? <Link href="/tickets/new" className="font-medium text-primary-text hover:underline">New ticket</Link> : null}
    </>
  );
  return (
    <>
      {/* Phones: a section heading over a rounded card of ticket rows. */}
      <section className="grid gap-2 md:hidden" aria-label={title}>
        <div className="flex items-baseline justify-between px-1">
          <h2 className="text-[0.8125rem] font-semibold tracking-[0.04em] text-muted-foreground uppercase">{title}</h2>
          <Link href="/tickets?group=all" className="text-sm font-medium text-acc-ink">See all</Link>
        </div>
        {rows.length ? (
          <PhoneTicketList tickets={rows.map((t) => ({ ...t, person: person(t) }))} unread={unread} now={now} />
        ) : (
          <p className="rounded-2xl bg-card px-4 py-5 text-sm text-muted-foreground">{emptyText}</p>
        )}
      </section>
      <Card role="region" aria-labelledby="list-title" className="@container/list max-md:hidden">
        <CardHead id="list-title" title={title} tip={tip} link={{ href: "/tickets?group=all", label: "View all" }} />
        {rows.length === 0 ? (
          <p className="border-t border-line2 px-5 py-4 text-sm text-muted-foreground">{emptyText}</p>
        ) : (
          <ul className="stagger pb-2">
            {rows.map((t) => {
              const level = t.severity ?? t.priority;
              const isUnread = unread.has(t.id);
              return (
                <li key={t.id} className="relative flex min-h-13 items-center gap-3 border-t border-line2 px-5 py-1.5 text-sm hover:bg-row-hover">
                  <span className="flex w-[4.5rem] shrink-0 items-center gap-1.5 font-mono text-[0.8438rem] text-muted-foreground">
                    #{t.number}
                    {isUnread ? <UnreadDot /> : null}
                  </span>
                  <span className={cn("size-2.5 shrink-0 rounded-full", levelDot(level))} title={levelName(level)}>
                    <span className="sr-only">{levelName(level)}</span>
                  </span>
                  <Link
                    href={`/tickets/${t.number}`}
                    title={t.title}
                    className={cn("min-w-0 flex-1 truncate after:absolute after:inset-0 hover:text-primary-text hover:underline", isUnread ? "font-semibold" : "font-medium")}
                  >
                    {t.title}
                  </Link>
                  {/* Hidden when the card itself is narrow (a small window, or the notifications panel open). */}
                  <span className="w-32 shrink-0 truncate text-[0.8125rem] text-muted-foreground @max-[38rem]/list:hidden">{person(t)}</span>
                  <span className="w-[6.5rem] shrink-0"><TicketStatusPill status={t.status} /></span>
                  <span className="w-12 shrink-0 text-right text-[0.8125rem] text-muted-foreground">{shortAgo(byFiled ? t.createdAt : t.lastActivityAt, now)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}

function StatRow({ stats }: { stats: Stat[] }) {
  return (
    <>
      {/* Phones: cards that swipe sideways, the first (the one to act on) in the accent colour. */}
      <div className="relative -mx-5 flex snap-x snap-mandatory scroll-px-5 gap-3 overflow-x-auto px-5 pb-1 [scrollbar-width:none] md:hidden">
        {stats.map(({ label, value, href, icon: Icon, note }, i) => (
          <Link
            key={label}
            href={href}
            className={cn(
              "grid w-[9.5rem] shrink-0 snap-start content-start gap-2.5 rounded-[1.125rem] p-4 outline-none focus-visible:ring-3 focus-visible:ring-acc/40 active:scale-[0.98]",
              i === 0
                ? "bg-acc text-primary-foreground shadow-[0_0.5rem_1.25rem_color-mix(in_srgb,var(--acc)_35%,transparent)]"
                : "bg-card shadow-[0_0.0625rem_0.125rem_rgba(20,22,40,0.06),0_0.125rem_0.5rem_rgba(20,22,40,0.04)]",
            )}
          >
            <span className={cn("flex size-8 items-center justify-center rounded-[0.5625rem]", i === 0 ? "bg-primary-foreground/20" : "bg-acc-t text-acc-ink")} aria-hidden>
              <Icon className="size-[1.125rem]" />
            </span>
            <span className="text-[1.875rem] leading-none font-bold tracking-[-0.03em] tabular-nums">{value}</span>
            <span className={cn("text-[0.8438rem] leading-snug font-medium", i === 0 ? "text-primary-foreground" : "text-ink2")}>
              {label}
              {note ? <span className="sr-only">, {note}</span> : null}
            </span>
          </Link>
        ))}
      </div>
      <div className="stagger grid grid-cols-[repeat(auto-fit,minmax(13.75rem,1fr))] gap-4 max-md:hidden">
        {stats.map(({ label, value, href, icon: Icon, note, tone }) => (
          <Link
            key={label}
            href={href}
            className="group flex items-center gap-4 rounded-[0.875rem] border border-line bg-card p-5 text-foreground shadow-(--shadow-card) transition-[border-color,box-shadow,transform] duration-200 ease-(--ease-out) hover:-translate-y-0.5 hover:border-acc-b hover:shadow-(--shadow-hover) focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none active:translate-y-0"
          >
            <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-[0.6875rem]", tone ? ICON_BOX[tone] : "bg-acc-t text-primary-text")} aria-hidden>
              <Icon className="size-[1.375rem]" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-muted-foreground">{label}</span>
              <span className="mt-0.5 flex items-baseline gap-x-2 truncate">
                <span className="text-[1.75rem] leading-tight font-semibold tracking-[-0.01em] tabular-nums">{value}</span>
                {note ? <span className="truncate text-[0.8125rem] text-muted-foreground">{note}</span> : null}
              </span>
            </span>
            <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-primary-text" aria-hidden />
          </Link>
        ))}
      </div>
    </>
  );
}
