import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { PlusIcon } from "lucide-react";
import { InlineAlert } from "@/components/inline-alert";
import { NotificationBell } from "@/components/notifications-panel";
import { ThemeToggle } from "@/components/theme-toggle";
import { DashboardSkeleton } from "@/components/skeletons";
import { Button } from "@/components/ui/button";
import { can, GRANT_LABELS } from "@/lib/auth/permissions";
import { auth, requireUser } from "@/lib/auth/session";
import { formatDateTime, formatLongDate, greeting } from "@/lib/format";
import { adminHome } from "./_home/admin-home";
import { workHome } from "./_home/work-home";
import { firstName, plural } from "./_home/words";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function DashboardPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Overview searchParams={searchParams} />
    </Suspense>
  );
}

async function Overview({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const me = await requireUser();
  const raw = (await searchParams).modules;
  const modulesParam = (Array.isArray(raw) ? raw[0] : raw) ?? "";
  const now = new Date();
  const { signUps, resets } = can(me, "users.requests") ? await auth.adminRequests() : { signUps: 0, resets: 0 };
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
      {me.grants.length && me.grantsUntil ? (
        <InlineAlert tone="info" role="status">
          An admin lent you {me.grants.map((a) => GRANT_LABELS[a].label).join(", ")} until {formatDateTime(me.grantsUntil)}. It ends by itself.
        </InlineAlert>
      ) : null}
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
