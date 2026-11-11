import { StatusPill } from "@/components/status-pill";
import { areaPath, type AreaWithParents } from "@/lib/areas/tree";
import { GRANT_LABELS, ROLE_LABELS, type Role } from "@/lib/auth/permissions";
import type { TempGrant } from "@/lib/auth/temp-access";
import { formatDateTime } from "@/lib/format";
import { STATUS_LABELS, userStatus, type UserStatus } from "@/lib/users/filter";
import { cn } from "@/lib/utils";
import { DeleteUserDialog } from "../_dialogs/delete-user-dialog";
import { ResetPasswordButton } from "../_dialogs/reset-password-button";
import { SignOutDevicesButton } from "../_dialogs/sign-out-devices-button";
import { TempAccessDialog } from "../_dialogs/temp-access-dialog";
import { UserDialog } from "../_dialogs/user-dialog";

const STATUS_TONE: Record<UserStatus, "ok" | "warn" | "neutral"> = { active: "ok", temp: "warn", off: "neutral" };

/** A user as the Users table lists them. */
export type UserRowData = {
  id: string;
  name: string;
  email: string;
  role: string;
  designer: boolean;
  teamLead: boolean;
  active: boolean;
  mustChangePassword: boolean;
  areas: { isLead: boolean; area: AreaWithParents }[];
};

/** One person in the Users table: who they are, their modules, status, and the admin's buttons. `meId`: the admin viewing. */
export function UserRow({ u, grant, meId }: { u: UserRowData; grant: TempGrant | undefined; meId: string }) {
  const status = userStatus(u);
  // Admins already have every feature; a turned-off account can't sign in to use it.
  const lendable = u.id !== meId && u.role !== "ADMIN" && u.active;
  const cell = "border-b border-line2 px-3.5 py-2 align-middle";
  return (
    // Turned-off rows keep full contrast; the Status pill says it (the board's fade was too pale).
    <tr className="transition-colors hover:bg-row-hover">
      <td className={cn(cell, "h-14 font-semibold")}>
        {u.name}
        {u.id === meId ? <span className="ml-1.5 text-[0.7813rem] font-normal text-muted-foreground">(you)</span> : null}
      </td>
      <td className={cn(cell, "font-mono text-[0.8125rem] break-all")}>{u.email}</td>
      <td className={cell}>
        <span className="flex flex-wrap gap-1">
          <StatusPill tone="neutral">{ROLE_LABELS[u.role as Role]}</StatusPill>
          {u.designer ? <StatusPill tone="neutral">Designer</StatusPill> : null}
          {u.teamLead ? <StatusPill tone="acc">Team Lead</StatusPill> : null}
          {grant ? (
            <span title={`Temporary access: ${grant.actions.map((a) => GRANT_LABELS[a].label).join(", ")}`}>
              <StatusPill tone="warn">Temp access</StatusPill>
            </span>
          ) : null}
        </span>
        {grant ? <span className="mt-1 block text-[0.75rem] text-muted-foreground">until {formatDateTime(grant.expiresAt)}</span> : null}
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
          <UserDialog user={{ id: u.id, name: u.name, email: u.email, role: u.role as Role, designer: u.designer, teamLead: u.teamLead, active: u.active }} isSelf={u.id === meId} />
          {lendable ? <TempAccessDialog user={{ id: u.id, name: u.name }} current={grant ? { actions: grant.actions, until: formatDateTime(grant.expiresAt) } : null} /> : null}
          {u.id !== meId ? <ResetPasswordButton id={u.id} name={u.name} /> : null}
          {u.id !== meId ? <SignOutDevicesButton id={u.id} name={u.name} /> : null}
          {u.id !== meId ? <DeleteUserDialog user={{ id: u.id, name: u.name, email: u.email }} /> : null}
        </div>
      </td>
    </tr>
  );
}
