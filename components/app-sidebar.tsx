"use client";

import type { AvatarPerson } from "@/lib/avatar";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { SearchIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Role } from "@/lib/auth/permissions";
import { cn } from "@/lib/utils";
import { filterNavGroups, isActive, navGroups } from "./nav";
import { NavCount, useNotifications } from "./notifications";
import { UserMenu } from "./user-menu";

export type SidebarUser = AvatarPerson & { role: Role; grants: readonly string[] };

// Brand, Search menu, 44 px menu items and the profile at the bottom follow the Base DCWD boards.
// Minimised (the topbar's toggle or Ctrl+B), it springs down to a rail of icons: the brand text and the labels fade and
// slide away one after another, counts become dots, and each icon gets its name as a tooltip.

const navButton = cn(
  "h-11 gap-3.5 rounded-lg px-3.5 text-[0.9375rem] font-medium text-ink2 transition-[background-color,box-shadow,width,height,padding] duration-200 hover:bg-row-hover hover:[&_svg]:translate-x-0.5 data-active:bg-acc data-active:font-medium data-active:text-primary-foreground data-active:shadow-(--shadow-nav-active) data-active:hover:bg-acc data-active:hover:text-primary-foreground [&_svg]:size-[1.125rem]",
  // In the rail: exactly 44 px with the icon centred.
  "group-data-[collapsible=icon]:size-11! group-data-[collapsible=icon]:gap-0 group-data-[collapsible=icon]:p-[0.8125rem]!",
  "[&_svg]:transition-transform [&_svg]:duration-220 [&_svg]:ease-(--ease-out)",
);
const groupLabel = cn(
  "h-auto px-3.5 pt-4 pb-2 text-xs font-semibold tracking-[0.06em] text-body2 uppercase duration-300 ease-(--ease-out)",
  "group-data-[collapsible=icon]:-translate-x-3",
);
/** Text that fades and slides out when minimised, and back in (a beat later) when opened. */
const fadeText = cn(
  "transition-[opacity,transform] duration-300 ease-(--ease-out) delay-(--d)",
  "group-data-[collapsible=icon]:-translate-x-3 group-data-[collapsible=icon]:opacity-0 group-data-[collapsible=icon]:delay-0",
);
/** The brand text also gives up its width in the rail, so it never spills past the edge while the sidebar shrinks. */
const brandText = cn(fadeText, "max-w-48 overflow-hidden transition-[opacity,transform,max-width]", "group-data-[collapsible=icon]:max-w-0");

export function AppSidebar({ user }: { user: SidebarUser | null }) {
  return <SidebarView pathname={usePathname()} user={user} />;
}

/**
 * The layout's Suspense fallback. It is part of the prerendered shell, where the path of a route like /tickets/[number]
 * isn't known yet, so it must not read it (the build fails if it does).
 */
export function AppSidebarShell() {
  return <SidebarView pathname={null} user={null} />;
}

function SidebarView({ pathname, user }: { pathname: string | null; user: SidebarUser | null }) {
  const active = (href: string) => pathname !== null && isActive(pathname, href);
  const { data } = useNotifications();
  const { state } = useSidebar();
  const [query, setQuery] = useState("");
  // The search box is hidden in the rail, so what was typed there must not hide any icons.
  const groups = state === "collapsed" ? navGroups(user) : filterNavGroups(navGroups(user), query);
  // Unread replies on My inbox, unopened new tickets on Tickets, and sign-up and password requests on Users.
  const counts: Record<string, { count: number; label: string }> = {
    "/inbox": { count: data?.messages ?? 0, label: "unread messages" },
    "/tickets": { count: data?.newTickets ?? 0, label: "new tickets" },
    "/admin/users": { count: data?.requests ?? 0, label: "waiting" },
  };
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader
        className={cn("h-24 shrink-0 flex-row items-center gap-2.5 overflow-hidden border-b border-line px-5 py-0 transition-[padding] duration-(--sidebar-dur) ease-(--sidebar-ease)", "group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0")}
      >
        <Link
          href="/"
          className={cn("flex items-center gap-2.5 rounded-lg transition-[gap] duration-(--sidebar-dur) ease-(--sidebar-ease) focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none", "group-data-[collapsible=icon]:gap-0")}
        >
          <Image src="/dcwd-seal.png" alt="Davao City Water District seal" width={44} height={44} priority className="size-11 shrink-0" />
          <span className={cn("flex flex-col whitespace-nowrap", brandText)} style={{ "--d": "120ms" } as React.CSSProperties}>
            <span className="text-[1.0625rem] leading-[1.2] font-semibold text-brand">QA Hub</span>
            <span className="mt-[0.1875rem] text-xs text-muted-foreground">DCWD ERP ticket hub</span>
          </span>
        </Link>
      </SidebarHeader>
      {/* Minimised, this button takes over from the one in the top bar. */}
      <Tooltip>
        <TooltipTrigger
          render={
            <SidebarTrigger
              id="sidebar-expand"
              variant="outline"
              size="icon"
              aria-label="Expand sidebar"
              onClick={() => focusSoon("sidebar-minimize")}
              className="mx-auto mt-4 hidden shrink-0 text-ink2 group-data-[collapsible=icon]:inline-flex"
            />
          }
        />
        <TooltipContent side="right">Expand sidebar</TooltipContent>
      </Tooltip>
      <div className="relative mx-4 mt-4 shrink-0 group-data-[collapsible=icon]:hidden">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          id="menu-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search menu"
          aria-label="Search menu"
          autoComplete="off"
          className="h-10 bg-grouped pl-10 text-[0.9063rem]"
        />
      </div>
      <SidebarContent className={cn("gap-0 px-4 transition-[padding] duration-(--sidebar-dur) ease-(--sidebar-ease)", "group-data-[collapsible=icon]:px-[1.375rem]")}>
        {groups.map((group) => (
          <SidebarGroup key={group.key} className="p-0">
            <SidebarGroupLabel className={groupLabel}>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-1">
                {group.items.map(({ href, label, icon: Icon, soon }, i) =>
                  soon ? (
                    <SidebarMenuItem key={href}>
                      <SidebarMenuButton disabled aria-disabled className="h-9 gap-3.5 rounded-lg px-3.5 text-sm [&_svg]:size-4">
                        <Icon />
                        <span>{label}</span>
                      </SidebarMenuButton>
                      <SidebarMenuBadge className="rounded-md bg-surface3 font-mono text-[0.6875rem] font-semibold text-muted-foreground">{soon}</SidebarMenuBadge>
                    </SidebarMenuItem>
                  ) : (
                    <SidebarMenuItem key={href}>
                      <SidebarMenuButton isActive={active(href)} render={<Link href={href} />} className={navButton} tooltip={label}>
                        <Icon />
                        <span className={cn("whitespace-nowrap", fadeText)} style={{ "--d": `${60 + i * 35}ms` } as React.CSSProperties}>
                          {label}
                        </span>
                      </SidebarMenuButton>
                      {counts[href]?.count ? (
                        <>
                          <SidebarMenuBadge className="right-2 h-auto px-0 peer-data-[size=default]/menu-button:top-1/2 -translate-y-1/2">
                            <NavCount {...counts[href]} />
                          </SidebarMenuBadge>
                          {/* Minimised, the count becomes a dot on the icon. */}
                          <span className={cn("pointer-events-none absolute top-2 left-7 pop-in hidden size-2.5 rounded-full border-2 border-sidebar bg-bad", "group-data-[collapsible=icon]:block")} aria-hidden>
                            <span className="qa-ping absolute inset-0 rounded-full bg-bad" />
                          </span>
                        </>
                      ) : null}
                    </SidebarMenuItem>
                  ),
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
        {groups.length === 0 ? <p className="px-3.5 pt-4 text-sm text-muted-foreground" role="status">No menu item matches.</p> : null}
      </SidebarContent>
      <SidebarFooter className="shrink-0 border-t border-line px-4 pt-3 pb-4 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-0">
        {user ? <UserMenu user={user} active={active("/account")} /> : <div className="h-[3.25rem]" />}
      </SidebarFooter>
    </Sidebar>
  );
}

/**
 * The button just pressed hides itself, which would drop a keyboard user's place, so focus moves to the one that replaces it.
 * Only when the keyboard is in use (`:focus-visible`), so a mouse click doesn't leave a focus ring showing.
 */
export function focusSoon(id: string) {
  if (!document.activeElement?.matches(":focus-visible")) return;
  requestAnimationFrame(() => document.getElementById(id)?.focus());
}
