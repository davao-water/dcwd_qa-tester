import { can } from "@/lib/auth/permissions";
import { auth, getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { notificationStore } from "@/lib/tickets/notifications";

// Polled by components/notifications.tsx every 30 seconds while the tab is open: the bell, the sidebar counts and
// whether the page should refresh. Ticket titles are only sent to people who can see those tickets.

const notifications = notificationStore(db);

/** GET /api/notifications */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const [{ count, items }, { messages, newTickets }, requests] = await Promise.all([
    notifications.unread(user),
    notifications.counts(user),
    can(user, "users.requests") ? auth.adminRequests() : null,
  ]);
  return Response.json(
    { count, items, messages, newTickets, requests: requests ? requests.signUps + requests.resets : 0 },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

