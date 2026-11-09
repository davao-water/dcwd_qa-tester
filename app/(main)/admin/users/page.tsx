import { AREA_PATH_SELECT, areaPath, rootName } from "@/lib/areas/tree";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { SearchIcon, UsersIcon } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { FilterSelect } from "@/components/filter-select";
import { Field } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { TableSkeleton } from "@/components/skeletons";
import { StatusPill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ROLE_LABELS, ROLES, type Role } from "@/lib/auth/permissions";
import { requireAction } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatDateTime, timeAgo } from "@/lib/format";
import { filterUsers, STATUS_LABELS, userStatus, type UserStatus } from "@/lib/users/filter";
import { cn } from "@/lib/utils";
import { ApprovalHost, PendingActions, ResetRequestActions } from "./pending-actions";
import { DeleteUserDialog } from "./delete-user-dialog";
import { ResetPasswordButton, SignOutDevicesButton, UserDialog } from "./user-dialog";

export const metadata: Metadata = { title: "Users" };

type Tab = "users" | "approval" | "reset";
const TABS: { key: Tab; label: string }[] = [
  { key: "users", label: "Users" },
  { key: "approval", label: "Approval" },
  { key: "reset", label: "Password reset" },
];

const STATUS_TONE: Record<UserStatus, "ok" | "warn" | "neutral"> = { active: "ok", temp: "warn", off: "neutral" };

/** The table head, as on the board: uppercase on the table-head colour. Sticks to the top while rows scroll. */
const HEAD = "sticky top-0 z-1 h-[3.125rem] bg-table-head px-3.5 text-left align-middle text-[0.7813rem] font-semibold tracking-[0.05em] text-navy uppercase first:rounded-l-lg last:rounded-r-lg";

export default function UsersPage({ searchParams }: PageProps<"/admin/users">) {
  // The header sits inside the guarded component so non-admins never see the page frame.
  return (
    <Suspense fallback={<TableSkeleton />}>
      <UsersBody searchParams={searchParams} />
    </Suspense>
  );
}

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

async function UsersBody({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  await connection();
  const me = await requireAction("users.manage");
  const tab: Tab = one(sp.tab) === "approval" ? "approval" : one(sp.tab) === "reset" ? "reset" : "users";
  const f = { q: one(sp.q).slice(0, 100), role: one(sp.role), module: one(sp.module), status: one(sp.status) };

  const [requests, resets, users] = await Promise.all([
    db.user.findMany({
      where: { pending: true },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, email: true, role: true, createdAt: true, claimHash: true },
    }),
    db.user.findMany({
      where: { pending: false, resetRequestedAt: { not: null } },
      orderBy: { resetRequestedAt: "asc" },
      select: { id: true, name: true, email: true, role: true, active: true, resetRequestedAt: true },
    }),
    db.user.findMany({
      where: { pending: false },
      orderBy: [{ active: "desc" }, { role: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        designer: true,
        teamLead: true,
        active: true,
        mustChangePassword: true,
        areas: { select: { isLead: true, area: { select: AREA_PATH_SELECT } } },
      },
    }),
  ]);

  // A sub-module counts for its top-level module in the Module filter.
  const withModules = users.map((u) => ({ ...u, modules: [...new Set(u.areas.map((a) => rootName(a.area)))] }));
  const shown = filterUsers(withModules, f);
  const moduleNames = [...new Set(withModules.flatMap((u) => u.modules))].sort((a, b) => a.localeCompare(b));
  const counts: Record<Tab, number> = { users: users.length, approval: requests.length, reset: resets.length };
  const filtered = !!(f.q || f.role || f.module || f.status);

  return (
    <ApprovalHost>
      {/* Big screens (D21): the page fits the window; the table scrolls inside its card. */}
      <div className="grid gap-6 desk:flex desk:h-[calc(100dvh-12.5rem)] desk:min-h-112 desk:flex-col">
        <PageHeader
          title="Users"
          description="Everyone who can sign in. People request an account on the sign-in page and get a temporary password there once you approve; accounts you add here get one from you."
          actions={<UserDialog />}
        />

        <nav aria-label="User sections" className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-line max-md:-mx-5 max-md:px-5 max-md:[scrollbar-width:none]">
          {TABS.map((t) => {
            const on = tab === t.key;
            const waiting = t.key !== "users" && counts[t.key] > 0;
            return (
              <Link
                key={t.key}
                href={t.key === "users" ? "/admin/users" : `/admin/users?tab=${t.key}`}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "flex h-12 shrink-0 items-center gap-2 border-b-2 px-4 text-[0.9375rem] font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                  on ? "border-acc text-primary-text" : "border-transparent text-muted-foreground hover:bg-row-hover hover:text-foreground",
                )}
              >
                {t.label}
                <span className={cn("inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 font-mono text-[0.75rem] tabular-nums", waiting ? "bg-warn-t text-warn-ink" : "bg-surface3 text-ink2")}>
                  {counts[t.key]}
                  <span className="sr-only">{waiting ? " waiting" : ""}</span>
                </span>
              </Link>
            );
          })}
        </nav>

        {tab === "approval" ? (
          <RequestList
            title="Waiting for approval"
            text="They signed up on the sign-in page. Approve only people who have told you they signed up. Once approved, their browser shows them a temporary password."
            empty="No sign-ups are waiting for approval."
            rows={requests.map((r) => ({
              id: r.id,
              name: r.name,
              email: r.email,
              role: ROLE_LABELS[r.role as Role],
              at: r.createdAt,
              actions: <PendingActions request={{ id: r.id, name: r.name, email: r.email, role: ROLE_LABELS[r.role as Role], claim: !!r.claimHash }} />,
            }))}
          />
        ) : tab === "reset" ? (
          <RequestList
            title="Password reset requests"
            text="They used “Forgot your password?” on the sign-in page. Reset gives you a temporary password to hand over in person; check it is really them first."
            empty="No password reset requests."
            rows={resets.map((r) => ({
              id: r.id,
              name: r.name,
              email: r.email,
              role: ROLE_LABELS[r.role as Role],
              at: r.resetRequestedAt!,
              actions: <ResetRequestActions id={r.id} name={r.name} />,
            }))}
          />
        ) : users.length === 0 ? (
          <EmptyState icon={UsersIcon} title="No users yet" />
        ) : (
          <>
            {/* A choice applies at once; search applies on Enter. It stays a plain GET form. */}
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

            <Card className="p-4 desk:min-h-0 desk:flex-1">
              <div className="overflow-x-auto desk:min-h-0 desk:flex-1 desk:overflow-y-auto desk:overscroll-contain">
                <table className="w-full min-w-[60rem] border-separate border-spacing-0 text-sm">
                  <thead>
                    <tr>
                      <th scope="col" className={cn(HEAD, "w-[12.5rem]")}>Nickname</th>
                      <th scope="col" className={HEAD}>Email</th>
                      <th scope="col" className={cn(HEAD, "w-[11.875rem]")}>Role</th>
                      <th scope="col" className={HEAD}>Modules</th>
                      <th scope="col" className={cn(HEAD, "w-[11.875rem]")}>Status</th>
                      <th scope="col" className={cn(HEAD, "w-[9.5rem]")}><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody className="stagger">
                    {shown.map((u) => {
                      const status = userStatus(u);
                      const cell = "border-b border-line2 px-3.5 py-2 align-middle";
                      return (
                        // Turned-off rows keep full contrast; the Status pill says it (the board's fade was too pale).
                        <tr key={u.id} className="transition-colors hover:bg-row-hover">
                          <td className={cn(cell, "h-14 font-semibold")}>
                            {u.name}
                            {u.id === me.id ? <span className="ml-1.5 text-[0.7813rem] font-normal text-muted-foreground">(you)</span> : null}
                          </td>
                          <td className={cn(cell, "font-mono text-[0.8125rem] break-all")}>{u.email}</td>
                          <td className={cell}>
                            <span className="flex flex-wrap gap-1">
                              <StatusPill tone="neutral">{ROLE_LABELS[u.role as Role]}</StatusPill>
                              {u.designer ? <StatusPill tone="neutral">Designer</StatusPill> : null}
                              {u.teamLead ? <StatusPill tone="acc">Team Lead</StatusPill> : null}
                            </span>
                          </td>
                          <td className={cn(cell, "text-[0.8438rem] text-body2")}>
                            {u.areas.length ? (
                              u.areas.map((a) => `${areaPath(a.area)}${a.isLead ? " (lead)" : ""}`).join(", ")
                            ) : (
                              <span className="text-muted-foreground">None</span>
                            )}
                          </td>
                          <td className={cell}>
                            <StatusPill tone={STATUS_TONE[status]}>{STATUS_LABELS[status]}</StatusPill>
                          </td>
                          <td className={cell}>
                            <div className="flex justify-end gap-0.5">
                              <UserDialog user={{ id: u.id, name: u.name, email: u.email, role: u.role as Role, designer: u.designer, teamLead: u.teamLead, active: u.active }} isSelf={u.id === me.id} />
                              {u.id !== me.id ? <ResetPasswordButton id={u.id} name={u.name} /> : null}
                              {u.id !== me.id ? <SignOutDevicesButton id={u.id} name={u.name} /> : null}
                              {u.id !== me.id ? <DeleteUserDialog user={{ id: u.id, name: u.name, email: u.email }} /> : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {shown.length === 0 ? <p className="px-4 py-8 text-center text-sm text-muted-foreground">No users match. Try another search or filter.</p> : null}
              </div>
              <p className="pt-3 text-sm text-muted-foreground">
                {shown.length} of {users.length} users
              </p>
            </Card>
          </>
        )}
      </div>
    </ApprovalHost>
  );
}

type RequestRow = { id: string; name: string; email: string; role: string; at: Date; actions: React.ReactNode };

/** The Approval and Password reset tabs: a card with its explanation and one row per request. */
function RequestList({ title, text, empty, rows }: { title: string; text: string; empty: string; rows: RequestRow[] }) {
  return (
    <Card role="region" aria-labelledby="requests-title" className="desk:min-h-0">
      <div className="border-b border-line2 px-5 pt-5 pb-4">
        <h2 id="requests-title" className="text-lg font-semibold">{title}</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{text}</p>
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="stagger desk:min-h-0 desk:overflow-y-auto desk:overscroll-contain">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line2 px-5 py-3 last:border-b-0">
              <span className="min-w-0 flex-[1_1_10rem] text-[0.9063rem] font-semibold">{r.name}</span>
              <span className="min-w-0 flex-[2_1_14rem] font-mono text-[0.8438rem] break-all">{r.email}</span>
              <StatusPill tone="neutral">{r.role}</StatusPill>
              <span className="w-16 text-[0.8438rem] text-muted-foreground" title={formatDateTime(r.at)}>{timeAgo(r.at)}</span>
              <span className="ml-auto">{r.actions}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
