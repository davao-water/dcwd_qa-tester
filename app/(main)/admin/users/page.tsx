import { rootName } from "@/lib/areas/tree";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { UsersIcon } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { TableSkeleton } from "@/components/skeletons";
import { Card } from "@/components/ui/card";
import { can, ROLE_LABELS, type Role } from "@/lib/auth/permissions";
import { requireAction } from "@/lib/auth/session";
import { tempAccessStore, type TempGrant } from "@/lib/auth/temp-access";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { filterUsers } from "@/lib/users/filter";
import { userAdminStore } from "@/lib/users/store";
import { cn } from "@/lib/utils";
import { UserDialog } from "./_dialogs/user-dialog";
import { UserFilters } from "./_list/user-filters";
import { UserRow } from "./_list/user-row";
import { ApprovalHost, PendingActions, ResetRequestActions } from "./_requests/pending-actions";
import { RequestList } from "./_requests/request-list";

export const metadata: Metadata = { title: "Users" };

type Tab = "users" | "approval" | "reset";
const TABS: { key: Tab; label: string }[] = [
  { key: "users", label: "Users" },
  { key: "approval", label: "Approval" },
  { key: "reset", label: "Password reset" },
];

const tempAccess = tempAccessStore(db);
const accounts = userAdminStore(db);

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
  // Admins get every tab. Someone lent "Sign-ups & password requests" (temporary access) gets only those two tabs.
  const me = await requireAction("users.requests");
  const full = can(me, "users.manage");
  const tabs = full ? TABS : TABS.filter((t) => t.key !== "users");
  const wanted = one(sp.tab);
  const tab: Tab = wanted === "approval" ? "approval" : wanted === "reset" ? "reset" : full ? "users" : "approval";
  const f = { q: one(sp.q).slice(0, 100), role: one(sp.role), module: one(sp.module), status: one(sp.status) };

  const [requests, resets, users, grants] = await Promise.all([
    accounts.signUpRequests(),
    accounts.resetRequests(),
    // The account list is for admins only: someone with temporary access gets no rows.
    accounts.accounts(full),
    full ? tempAccess.live() : new Map<string, TempGrant>(),
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
          description={
            full
              ? "Everyone who can sign in. People request an account on the sign-in page and get a temporary password there once you approve; accounts you add here get one from you."
              : `Sign-ups and password requests, which an admin lent you until ${me.grantsUntil ? formatDateTime(me.grantsUntil) : "later today"}.`
          }
          actions={full ? <UserDialog /> : null}
        />

        <nav aria-label="User sections" className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-line max-md:-mx-5 max-md:px-5 max-md:[scrollbar-width:none]">
          {tabs.map((t) => {
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
            <UserFilters f={f} moduleNames={moduleNames} filtered={filtered} />

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
                      <th scope="col" className={cn(HEAD, "w-[11.5rem]")}><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody className="stagger">
                    {shown.map((u) => <UserRow key={u.id} u={u} grant={grants.get(u.id)} meId={me.id} />)}
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
