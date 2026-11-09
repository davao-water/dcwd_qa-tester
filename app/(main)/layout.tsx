import { Suspense } from "react";
import { AppSplash } from "@/components/app-splash";
import { AppSidebar, AppSidebarShell, type SidebarUser } from "@/components/app-sidebar";
import { AppTopbar, AppTopbarShell } from "@/components/app-topbar";
import { BottomNav } from "@/components/bottom-nav";
import { NotificationsProvider } from "@/components/notifications";
import { NotificationsPanel, NotificationsPanelProvider } from "@/components/notifications-panel";
import { PwaSetup } from "@/components/pwa-setup";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { WaveFooter } from "@/components/wave-footer";
import { getCurrentUser } from "@/lib/auth/session";

import { PushPrompt } from "./push-prompt";
import { ToneListener } from "./tone-listener";

// The session is read behind Suspense (Cache Components), so the chrome streams in without holding up the page.
// This only shapes the navigation; each page and action still checks access itself.

export default function MainLayout({ children }: LayoutProps<"/">) {
  return (
    <NotificationsProvider>
      <AppSplash />
      <PwaSetup />
      <SidebarProvider style={{ "--sidebar-width": "17.5rem", "--sidebar-width-icon": "5.5rem" } as React.CSSProperties}>
        {/* The notifications panel is the third column, beside the page; its state lives here so it stays open across pages. */}
        <NotificationsPanelProvider>
          <Suspense fallback={<AppSidebarShell />}>
            <SessionSidebar />
          </Suspense>
          <SidebarInset className="min-w-0">
            <Suspense fallback={<AppTopbarShell />}>
              <SessionTopbar />
            </Suspense>
            {/* A CSS container, so a page can respond to the room it has when the notifications panel takes some. */}
            <main data-main className="page-enter @container/main relative z-1 w-full flex-1 space-y-6 max-md:overflow-x-clip max-md:px-5 max-md:py-5 md:px-8 md:pt-8 md:pb-18">
              {children}
            </main>
            <WaveFooter />
          </SidebarInset>
          <NotificationsPanel />
        </NotificationsPanelProvider>
      </SidebarProvider>
      {/* Phones: the tab bar. It reads the URL, so it's inside Suspense too. */}
      <Suspense fallback={null}>
        <SessionBottomNav />
      </Suspense>
      {/* It reads the URL, which Cache Components only allows inside Suspense. */}
      <Suspense fallback={null}>
        <PushPrompt />
      </Suspense>
      <ToneListener />
      {/* Here, not in a page, so a toast (the board's Undo) and what it does on closing outlive a page change. */}
      <Toaster position="bottom-right" />
    </NotificationsProvider>
  );
}

async function sessionUser(): Promise<SidebarUser | null> {
  const u = await getCurrentUser();
  return u ? { id: u.id, name: u.name, role: u.role, grants: u.grants, avatarColor: u.avatarColor, avatarName: u.avatarName } : null;
}

async function SessionSidebar() {
  return <AppSidebar user={await sessionUser()} />;
}

async function SessionTopbar() {
  return <AppTopbar user={await sessionUser()} />;
}

async function SessionBottomNav() {
  const user = await sessionUser();
  return user ? <BottomNav role={user.role} /> : null;
}
