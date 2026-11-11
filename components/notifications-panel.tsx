"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState, useTransition } from "react";
import { BellIcon, CheckCheckIcon, InboxIcon, XIcon } from "lucide-react";
import { markAllTicketsRead } from "@/app/(main)/tickets/actions";
import { UnreadDot } from "@/components/ticket-badges";
import { useNotifications } from "@/components/notifications";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

// Notifications as a third column on the right (HANDOFF section 5), opened by the bell. It stays open while moving
// between pages, because it lives in the layout. Under 1800 px a full sidebar minimizes while it is open, and comes back
// when it closes unless the person changed the sidebar meanwhile. Phones: full screen over the page (D1).

/** Below this width the sidebar makes room for the panel. */
const ROOMY = 1800;

type PanelCtx = { open: boolean; toggle: (bell: HTMLElement) => void; close: () => void };
const PanelContext = createContext<PanelCtx>({ open: false, toggle: () => {}, close: () => {} });

export function NotificationsPanelProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const { open: sidebarOpen, setOpen: setSidebar, isMobile } = useSidebar();
  const bell = useRef<HTMLElement | null>(null);
  /** The sidebar was minimized for the panel, so it comes back when the panel closes. */
  const autoMinimized = useRef(false);
  /** The next sidebar change is ours, not the person's. */
  const ours = useRef(false);

  // The person minimized or expanded the sidebar themselves while the panel was open: leave it as they set it.
  useEffect(() => {
    if (ours.current) ours.current = false;
    else autoMinimized.current = false;
  }, [sidebarOpen]);

  const close = useCallback(() => {
    setOpen(false);
    if (autoMinimized.current) {
      autoMinimized.current = false;
      ours.current = true;
      setSidebar(true);
    }
    // Back to the bell, unless the person has already moved on to something else. If the window changed size meanwhile,
    // the bell that opened it may be hidden now, so use whichever bell is showing.
    const active = document.activeElement;
    if (!active || active === document.body || document.getElementById("notifications-panel")?.contains(active)) {
      const shown = (el: HTMLElement | null) => !!el && el.getClientRects().length > 0;
      const target = shown(bell.current) ? bell.current : [...document.querySelectorAll<HTMLElement>('[aria-controls="notifications-panel"]')].find(shown);
      target?.focus();
    }
  }, [setSidebar]);

  // The window is narrowed (or widened from phone size) while the panel is open: make room the same way as on opening.
  useEffect(() => {
    if (!open) return;
    const onResize = () => {
      if (!isMobile && sidebarOpen && window.innerWidth < ROOMY && !autoMinimized.current) {
        autoMinimized.current = true;
        ours.current = true;
        setSidebar(false);
      }
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open, isMobile, sidebarOpen, setSidebar]);

  const toggle = useCallback(
    (el: HTMLElement) => {
      bell.current = el;
      if (open) return close();
      setOpen(true);
      if (!isMobile && sidebarOpen && window.innerWidth < ROOMY) {
        autoMinimized.current = true;
        ours.current = true;
        setSidebar(false);
      }
    },
    [open, close, isMobile, sidebarOpen, setSidebar],
  );

  return <PanelContext.Provider value={{ open, toggle, close }}>{children}</PanelContext.Provider>;
}

const usePanel = () => useContext(PanelContext);

/** The bell in the top bar (and the phone Dashboard's header): opens and closes the panel, with the unread count. */
export function NotificationBell() {
  const { data } = useNotifications();
  const { open, toggle } = usePanel();
  const count = data?.count ?? 0;
  return (
    <Button
      variant="outline"
      size="icon"
      aria-label={count ? `Notifications: ${count} unread ticket${count === 1 ? "" : "s"}` : "Notifications"}
      aria-expanded={open}
      aria-controls="notifications-panel"
      title="Notifications"
      onClick={(e) => toggle(e.currentTarget)}
      className={cn("relative size-[2.375rem] rounded-[0.5625rem] text-ink2", open && "border-acc-b bg-acc-t text-primary-text")}
    >
      {/* Shakes now and then while something is unread; keyed by the count so a new arrival shakes it straight away. */}
      <BellIcon key={count} className={cn(count && !open && "qa-ring")} />
      {count ? (
        <span
          className="absolute -top-1.5 -right-1.5 isolate flex h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full bg-bad px-1 text-[0.6875rem] leading-none font-semibold text-on-tone ring-2 ring-background"
          aria-hidden
        >
          <span className="qa-ping absolute inset-0 -z-1 rounded-full bg-bad" />
          {count > 9 ? "9+" : count}
        </span>
      ) : null}
    </Button>
  );
}

/** The panel itself: header, the newest unread tickets, then My inbox and Mark all as read. */
export function NotificationsPanel() {
  const { open, close } = usePanel();
  const { data, poll } = useNotifications();
  const { isMobile } = useSidebar();
  const [marking, startTransition] = useTransition();
  const router = useRouter();
  const closeButton = useRef<HTMLButtonElement>(null);
  const count = data?.count ?? 0;

  // Focus goes to Close on opening. Focus isn't trapped: the page beside the panel stays usable.
  useEffect(() => {
    if (open) closeButton.current?.focus();
  }, [open]);

  // Esc closes it, when the panel or the page itself has focus (not while a dialog or menu is in use).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const active = document.activeElement;
      const inPanel = !!active && !!document.getElementById("notifications-panel")?.contains(active);
      if (inPanel || active === document.body || active?.getAttribute("aria-controls") === "notifications-panel") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  // Only once the data has arrived (after hydration): the prerendered shell, which holds the closed panel, can't read
  // the clock.
  const now = data ? new Date() : null;
  return (
    // Always in the page, so it can slide in and out with the sidebar's own timing: a column that widens from 0 on
    // laptops, a full screen that slides from the right on phones. Closed, it is inert: hidden from keys and readers.
    <aside
      id="notifications-panel"
      aria-label="Notifications"
      inert={!open}
      data-open={open ? "" : undefined}
      className={cn(
        "overflow-hidden bg-card text-foreground",
        // Laptops: a third column, as tall as the window, beside the page.
        "md:sticky md:top-0 md:z-20 md:h-svh md:shrink-0 md:transition-[width,border-color] md:duration-(--sidebar-dur) md:ease-(--sidebar-ease)",
        // Closed it is truly 0 wide: no border, which would otherwise leave a 1 px line at the right edge.
        open ? "md:w-[25rem] md:border-l md:border-line" : "md:w-0 md:border-l-0",
        // Phones: full screen over the page. Only opening and closing animate, so turning a tablet past the phone width
        // doesn't send a closed panel sliding across the screen.
        "max-md:fixed max-md:inset-0 max-md:z-50 max-md:duration-(--sidebar-dur) max-md:ease-(--sidebar-ease)",
        open ? "max-md:translate-x-0 max-md:transition-transform" : "max-md:pointer-events-none max-md:invisible max-md:translate-x-full max-md:transition-[transform,visibility]",
      )}
    >
      <div className="flex h-full flex-col md:w-[25rem] max-md:pt-[env(safe-area-inset-top)] max-md:pb-[env(safe-area-inset-bottom)]">
      <header className="flex h-24 shrink-0 items-center justify-between gap-3 border-b border-line px-6 max-md:h-16 max-md:px-5">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">Notifications</h2>
          <p className="text-sm text-muted-foreground" aria-live="polite">{count ? `${count} unread` : "Nothing unread"}</p>
        </div>
        <Button ref={closeButton} variant="ghost" size="icon" aria-label="Close notifications" title="Close notifications" onClick={close}>
          <XIcon />
        </Button>
      </header>

      {data?.items.length ? (
        <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {data.items.map((t) => (
            <li key={t.id} className="border-b border-line2">
              <Link
                href={`/tickets/${t.number}?tab=conversation`}
                // On a phone the panel covers the page, so it steps aside for the ticket.
                onClick={() => isMobile && close()}
                className="flex items-start gap-3 px-6 py-3.5 outline-none transition-colors hover:bg-row-hover focus-visible:bg-row-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset max-md:px-5"
              >
                <UnreadDot className="mt-[0.4375rem]" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.9063rem] leading-[1.4] font-medium" title={t.title}>{t.title}</span>
                  <span className="block text-[0.8125rem] text-muted-foreground">
                    <span className="font-mono">#{t.number}</span>
                    {t.actorName ? ` · ${t.actorName}` : ""}
                    {now ? ` · ${timeAgo(new Date(t.lastActivityAt), now)}` : ""}
                  </span>
                </span>
              </Link>
            </li>
          ))}
          {count > data.items.length ? (
            <li className="px-6 py-3 text-center text-[0.8125rem] text-muted-foreground">
              And {count - data.items.length} more in <Link href="/inbox" className="font-medium text-primary-text hover:underline">My inbox</Link>
            </li>
          ) : null}
        </ul>
      ) : (
        <p className="flex-1 px-6 py-12 text-center text-sm text-muted-foreground">You&apos;re all caught up.</p>
      )}

      <footer className="flex shrink-0 gap-2 border-t border-line px-6 py-4 max-md:px-5">
        <Button variant="outline" className="flex-1" nativeButton={false} render={<Link href="/inbox" onClick={() => isMobile && close()} />}>
          <InboxIcon /> My inbox
        </Button>
        {count ? (
          <Button
            variant="outline"
            className="flex-1"
            disabled={marking}
            onClick={() =>
              startTransition(async () => {
                await markAllTicketsRead();
                poll();
                router.refresh();
              })
            }
          >
            <CheckCheckIcon /> {marking ? "Marking…" : "Mark all as read"}
          </Button>
        ) : null}
      </footer>
      </div>
    </aside>
  );
}
