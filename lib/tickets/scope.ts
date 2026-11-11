import type { Prisma } from "@/lib/generated/prisma/client";
import { canReadTicket, ticketScope, type Actor } from "./workflow";

/** The Prisma filter for the tickets `actor` may see (see ticketScope). */
export function scopeWhere(actor: Actor): Prisma.TicketWhereInput {
  const s = ticketScope(actor);
  return s === "all" ? {} : s;
}

/** The Prisma filter for the tickets `actor` may read: every ticket, for anyone who may view tickets (see canReadTicket). */
export function readWhere(actor: Actor): Prisma.TicketWhereInput {
  return canReadTicket(actor) ? {} : { id: { in: [] } };
}
