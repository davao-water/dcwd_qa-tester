import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BellIcon, ChevronRightIcon, ClockIcon, KeyRoundIcon, ShieldIcon, UserRoundIcon, UsersRoundIcon, Volume2Icon } from "lucide-react";
import { AvatarUpload } from "@/components/avatar-upload";
import { PageHeader } from "@/components/page-header";
import { SettingsSkeleton } from "@/components/skeletons";
import { can, ROLE_LABELS } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { pushStore } from "@/lib/push/store";
import { PRESET_TONES } from "@/lib/push/tones";
import { ampm } from "@/lib/time-options";
import { AppearanceRow, RequestsCount, SignOutRow } from "./settings-bits";
import { SettingsRowBody, rowClass, type TileTone } from "./settings-row";

export const metadata: Metadata = { title: "Settings" };

// The phone's Settings tab: everything My account has, plus Team and (for admins) Users, as short groups of rows like a
// phone's own settings. On a laptop the sidebar and My account cover the same ground, but the page works there too.

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" />
      <Suspense fallback={<SettingsSkeleton />}>
        <SettingsBody />
      </Suspense>
    </>
  );
}

async function SettingsBody() {
  const me = await requireUser();
  const push = pushStore(db);
  const [tone, hours] = await Promise.all([push.tone(me.id), push.workHours(me.id)]);
  const toneLabel = tone.tone === "silent" ? "Silent" : (PRESET_TONES.find((t) => t.id === tone.tone)?.label ?? "Tone 1");

  return (
    <div className="mx-auto grid w-full max-w-xl gap-5">
      <AvatarUpload person={me} avatarClassName="size-14 text-xl" className="rounded-2xl bg-card p-4 shadow-[0_0.0625rem_0.125rem_rgba(20,22,40,0.06),0_0.125rem_0.5rem_rgba(20,22,40,0.04)]">
        <Link href="/account?tab=profile" className="flex min-w-0 flex-1 items-center gap-3.5 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-acc/30">
          <span className="grid min-w-0 flex-1 gap-0.5">
            <span className="truncate text-lg font-semibold">{me.name}</span>
            <span className="truncate text-sm text-muted-foreground">
              {ROLE_LABELS[me.role]} · {me.email}
            </span>
          </span>
          <ChevronRightIcon className="size-[1.125rem] shrink-0 text-muted-foreground" aria-hidden />
        </Link>
      </AvatarUpload>

      <Group label="Account">
        <Row href="/account?tab=profile" icon={<UserRoundIcon />} tone="indigo" label="Profile" />
        <Row href="/account?tab=password" icon={<KeyRoundIcon />} tone="slate" label="Password" />
      </Group>

      <Group label="Notifications and look">
        <Row href="/account?tab=notifications" icon={<BellIcon />} tone="red" label="Notifications" />
        <Row href="/account?tab=sound" icon={<Volume2Icon />} tone="violet" label="Sound" value={toneLabel} />
        <Row href="/account?tab=hours" icon={<ClockIcon />} tone="amber" label="Work hours" value={`${ampm(hours.workStartMin)}–${ampm(hours.workEndMin)}`} />
        <AppearanceRow />
      </Group>

      <Group label="Workspace">
        <Row href="/team" icon={<UsersRoundIcon />} tone="green" label="Team & modules" />
        {can(me, "users.requests") ? <Row href="/admin/users" icon={<ShieldIcon />} tone="indigo" label="Users" value={<RequestsCount />} /> : null}
      </Group>

      <div className="overflow-hidden rounded-2xl bg-card shadow-[0_0.0625rem_0.125rem_rgba(20,22,40,0.06),0_0.125rem_0.5rem_rgba(20,22,40,0.04)]">
        <SignOutRow />
      </div>
    </div>
  );
}

/** A rounded card of rows, with hairlines between them that start after the icon, as on a phone. */
function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <ul
      aria-label={label}
      className="overflow-hidden rounded-2xl bg-card shadow-[0_0.0625rem_0.125rem_rgba(20,22,40,0.06),0_0.125rem_0.5rem_rgba(20,22,40,0.04)] [&>li+li]:relative [&>li+li]:before:absolute [&>li+li]:before:top-0 [&>li+li]:before:right-0 [&>li+li]:before:left-[3.75rem] [&>li+li]:before:h-px [&>li+li]:before:bg-line2"
    >
      {children}
    </ul>
  );
}

function Row({ href, icon, tone, label, value }: { href: string; icon: React.ReactNode; tone: TileTone; label: string; value?: React.ReactNode }) {
  return (
    <li>
      <Link href={href} className={rowClass}>
        <SettingsRowBody icon={icon} tone={tone} label={label} value={value} />
        <ChevronRightIcon className="size-[1.125rem] shrink-0 text-muted-foreground" aria-hidden />
      </Link>
    </li>
  );
}
