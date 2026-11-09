import {
  FileSpreadsheetIcon,
  HouseIcon,
  InboxIcon,
  LayoutDashboardIcon,
  SettingsIcon,
  TicketIcon,
  UsersIcon,
  UsersRoundIcon,
  type LucideIcon,
} from "lucide-react";
import { can, type Permitted, type Role } from "@/lib/auth/permissions";

/** `soon` marks an item that is planned but not built yet; it renders disabled with that badge. */
export type NavItem = { href: string; label: string; icon: LucideIcon; soon?: string };
export type NavGroupKey = "tickets" | "admin";
export type NavGroup = { key: NavGroupKey; label: string; items: NavItem[] };

export const TICKETS_NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboardIcon },
  { href: "/tickets", label: "Tickets", icon: TicketIcon },
  { href: "/inbox", label: "My inbox", icon: InboxIcon },
  { href: "/team", label: "Team & modules", icon: UsersRoundIcon },
];

/** Everyone: their own Daily Accomplishment Report. */
export const DAR_NAV: NavItem = { href: "/dar", label: "My DAR", icon: FileSpreadsheetIcon };

export const ADMIN_NAV: NavItem[] = [
  { href: "/admin/users", label: "Users", icon: UsersIcon },
];

const PAGES: NavItem[] = [
  { href: "/account", label: "My account", icon: UsersIcon },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
];

/** Users shows for admins and for anyone lent "Sign-ups & password requests" (temporary access). */
export function navGroups(user: Permitted | null): NavGroup[] {
  const tickets = can(user, "dar.use") ? [...TICKETS_NAV, DAR_NAV] : TICKETS_NAV;
  const groups: NavGroup[] = [{ key: "tickets", label: "Menu", items: tickets }];
  if (can(user, "users.requests")) groups.push({ key: "admin", label: "Admin", items: ADMIN_NAV });
  return groups;
}

/** What "Search menu" leaves in the sidebar: items whose name contains the words typed, in groups that still have any. */
export function filterNavGroups(groups: NavGroup[], query: string): NavGroup[] {
  const q = query.trim().toLowerCase();
  if (!q) return groups;
  return groups
    .map((g) => ({ ...g, items: g.items.filter((i) => i.label.toLowerCase().includes(q)) }))
    .filter((g) => g.items.length > 0);
}

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
}

/** The nav entry for the current path, for the breadcrumb. */
export function currentNav(pathname: string): { item: NavItem; group: NavGroupKey | null } {
  const all: [NavGroupKey | null, NavItem[]][] = [["tickets", [...TICKETS_NAV, DAR_NAV]], ["admin", ADMIN_NAV], [null, PAGES]];
  for (const [group, items] of all) {
    const item = items.find((n) => n.href !== "/" && isActive(pathname, n.href));
    if (item) return { item, group };
  }
  return { item: TICKETS_NAV[0], group: "tickets" };
}

/** One step of the top bar's breadcrumb. With no `href` it is plain text. `mono`: a ticket number. */
export type Crumb = { label: string; href?: string; mono?: boolean };

/** The trail after the home icon. The last step is the current page. */
export function breadcrumbs(pathname: string): Crumb[] {
  const ticket = pathname.match(/^\/tickets\/(\d+)$/)?.[1];
  if (ticket) return [{ label: "Tickets", href: "/tickets" }, { label: `#${ticket}`, mono: true }];
  if (pathname === "/tickets/new") return [{ label: "Tickets", href: "/tickets" }, { label: "New ticket" }];
  if (pathname === "/dar/setup") return [{ label: "My DAR", href: "/dar" }, { label: "Set-up" }];
  const { item, group } = currentNav(pathname);
  return group === "admin" ? [{ label: "Admin" }, { label: item.label }] : [{ label: item.label }];
}

// ── Phones (below md): a bottom tab bar instead of the sidebar ──

/** The bottom bar's tabs. Inbox is the raised main button in the middle. */
export type MobileTab = NavItem & { main?: boolean };

export function mobileTabs(role: Role | null): MobileTab[] {
  return [
    { href: "/", label: "Home", icon: HouseIcon },
    { href: "/tickets", label: "Tickets", icon: TicketIcon },
    { href: "/inbox", label: "Inbox", icon: InboxIcon, main: true },
    ...(can(role ? { role } : null, "dar.use") ? [{ href: "/dar", label: "DAR", icon: FileSpreadsheetIcon }] : []),
    { href: "/settings", label: "Settings", icon: SettingsIcon },
  ];
}

/** Pages reached from Settings on a phone, so the Settings tab stays lit there. */
const SETTINGS_PAGES = ["/settings", "/account", "/team", "/admin"];

/** Which tab is lit for this page. */
export function mobileTabFor(pathname: string): string {
  if (SETTINGS_PAGES.some((p) => isActive(pathname, p))) return "/settings";
  return ["/tickets", "/inbox", "/dar"].find((p) => isActive(pathname, p)) ?? "/";
}

/** A tab's own page shows the bottom bar; pages inside one (a ticket, an open conversation) show a back arrow. */
export function isTabRoot(pathname: string, openConversation: boolean): boolean {
  if (pathname === "/inbox") return !openConversation;
  return ["/", "/tickets", "/dar", "/settings"].includes(pathname);
}

const TAB_LABEL: Record<string, string> = { "/": "Home", "/tickets": "Tickets", "/inbox": "Inbox", "/dar": "My DAR", "/settings": "Settings" };

/**
 * The back button on an inner page: where it goes when there's no history to go back to (e.g. opened from a
 * notification), and the name it shows ("‹ Tickets").
 */
export function backTarget(pathname: string): { href: string; label: string } {
  let href: string;
  if (pathname === "/inbox") href = "/inbox";
  else if (SETTINGS_PAGES.some((p) => isActive(pathname, p))) href = "/settings";
  else href = pathname.replace(/\/[^/]+\/?$/, "") || "/";
  return { href, label: TAB_LABEL[href] ?? "Back" };
}

const ACCOUNT_SECTIONS: Record<string, string> = { profile: "Profile", password: "Password", notifications: "Notifications", sound: "Sound", hours: "Work hours" };

/** The short title in the middle of an inner page's top bar on a phone. */
export function mobileTitle(pathname: string, params: { get(name: string): string | null }): string {
  const ticket = pathname.match(/^\/tickets\/(\d+)$/)?.[1] ?? (pathname === "/inbox" ? params.get("t") : null);
  if (ticket) return `#${ticket}`;
  if (pathname === "/tickets/new") return "New ticket";
  if (pathname === "/dar/setup") return "DAR set-up";
  if (pathname === "/account") return ACCOUNT_SECTIONS[params.get("tab") ?? ""] ?? "My account";
  return currentNav(pathname).item.label;
}
