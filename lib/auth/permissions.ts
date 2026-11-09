export const ROLES = ["ADMIN", "QA", "DEV"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = { ADMIN: "Admin", QA: "QA tester", DEV: "Developer" };

/** Every permission check in the app goes through this matrix. Per-ticket rules (assignee, reporter) are in lib/tickets/workflow.ts. */
const MATRIX = {
  "team.view": ["ADMIN", "QA", "DEV"],
  /** Opening the ticket pages and reading any ticket. Which tickets are a person's own is decided by ticketScope in lib/tickets/workflow.ts. */
  "tickets.view": ["ADMIN", "QA", "DEV"],
  /** Every ticket counts as your own, in every tab and for every change. (Anyone may read any ticket from the All tab.) */
  "tickets.viewAll": ["ADMIN"],
  /** Filing, editing and deleting tickets is for QA testers (their own) and admins. */
  "tickets.create": ["ADMIN", "QA"],
  "tickets.delete": ["ADMIN", "QA"],
  "tickets.comment": ["ADMIN", "QA", "DEV"],
  "tickets.assign": ["ADMIN", "QA"],
  "tickets.resolve": ["ADMIN", "DEV"],
  "tickets.verify": ["ADMIN", "QA"],
  /** Correcting a ticket's category after filing: admins, and the assigned developer (canCategorize in lib/tickets/workflow.ts). */
  "tickets.categorize": ["ADMIN", "DEV"],
  /** Team & modules: modules at every level and their members. Admins, and anyone with the Team Lead tick-box (FLAG_GRANTS). */
  "areas.manage": ["ADMIN"],
  /** Users (accounts, roles, sign-ups, passwords) stays admin-only: no tick-box or temporary access grants it. */
  "users.manage": ["ADMIN"],
  /** Users → Approval and Password reset only: approve or reject sign-ups, handle forgot-password requests. */
  "users.requests": ["ADMIN"],
  "projects.manage": ["ADMIN"],
  "workspace.manage": ["ADMIN"],
  /** Your own Daily Accomplishment Report, set up under My details. Each person sees only their own, admins included. */
  "dar.use": ["QA", "DEV", "ADMIN"],
  /** Sending UI/UX designs for approval: no role has it by itself, only the Designer tick-box (FLAG_GRANTS). */
  "designs.create": [],
  /** Every design review, not just the ones you design or approve. */
  "designs.viewAll": ["ADMIN"],
} as const satisfies Record<string, readonly Role[]>;

export type Action = keyof typeof MATRIX;
export const ACTIONS = Object.keys(MATRIX) as Action[];

/** Ticked on the account in Admin → Users, on top of the role. */
type Flag = "designer" | "teamLead";

/** Actions an account's tick-box grants whatever its role. */
const FLAG_GRANTS: Partial<Record<Action, Flag>> = { "designs.create": "designer", "areas.manage": "teamLead" };

/**
 * Admin features an admin can lend to someone for a few hours (Admin → Users → Temporary access). Managing accounts and
 * roles (users.manage) is never one of them, so nobody can make themselves a permanent admin.
 */
// designs.viewAll joins this list once Design reviews has a page that checks it.
export const GRANTABLE = ["users.requests", "areas.manage", "tickets.viewAll"] as const satisfies readonly Action[];
export type GrantableAction = (typeof GRANTABLE)[number];

export const GRANT_LABELS: Record<GrantableAction, { label: string; hint: string }> = {
  "users.requests": { label: "Sign-ups & password requests", hint: "Approve or reject new sign-ups and handle forgot-password requests." },
  "areas.manage": { label: "Team & modules", hint: "Add and edit modules and choose who works on each." },
  "tickets.viewAll": { label: "All tickets", hint: "Every ticket shows in their tabs, as it does for admins." },
};

export function isGrantable(v: unknown): v is GrantableAction {
  return typeof v === "string" && (GRANTABLE as readonly string[]).includes(v);
}

/** `grants`: what a live temporary access lends them (lib/auth/temp-access.ts); only GRANTABLE actions count. */
export type Permitted = { role: Role; designer?: boolean; teamLead?: boolean; grants?: readonly string[] };

export function can(user: Permitted | null | undefined, action: Action): boolean {
  if (!user) return false;
  const flag = FLAG_GRANTS[action];
  return (
    (MATRIX[action] as readonly Role[]).includes(user.role) ||
    (!!flag && user[flag] === true) ||
    (isGrantable(action) && !!user.grants?.includes(action))
  );
}

export function isRole(v: unknown): v is Role {
  return typeof v === "string" && (ROLES as readonly string[]).includes(v);
}
