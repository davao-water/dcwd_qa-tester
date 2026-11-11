"use client";

import { useEffect } from "react";
import { useNotifications } from "@/components/notifications";
import { ticketTag } from "@/lib/push/message";
import { markTicketRead } from "@/app/(main)/tickets/actions";

/**
 * Closes this ticket's device notifications (its replies and each status change), so its "3 new replies" count starts
 * again from what's unread.
 */
function closeDeviceNotifications(number: number) {
  if (!("serviceWorker" in navigator)) return;
  const tag = ticketTag(number);
  navigator.serviceWorker
    .getRegistration("/")
    .then((reg) => reg?.getNotifications())
    .then((shown) => shown?.filter((n) => n.tag === tag || n.tag.startsWith(`${tag}-`)).forEach((n) => n.close()), () => {});
}

/**
 * Marks the ticket read once this page has shown its latest activity, and again whenever a refresh brings newer
 * activity in. Then the bell and the sidebar count update at once, without waiting for the next poll.
 */
export function MarkRead({ ticketId, number, lastActivityAt }: { ticketId: string; number: number; lastActivityAt: string }) {
  const { poll } = useNotifications();
  useEffect(() => {
    let live = true;
    closeDeviceNotifications(number);
    markTicketRead(ticketId).then(() => live && poll(), () => {});
    return () => {
      live = false;
    };
  }, [ticketId, number, lastActivityAt, poll]);
  return null;
}
