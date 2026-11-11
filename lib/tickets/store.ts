import type { PrismaClient } from "@/lib/generated/prisma/client";
import { pendingUploads } from "./pending-uploads";
import { ticketChanges } from "./store-changes";
import { ticketLists } from "./store-lists";
import { ticketReads } from "./store-reads";

// Prisma glue for tickets, put together from its parts: changes (store-changes.ts), files waiting to be attached
// (pending-uploads.ts), the Tickets page's list and board (store-lists.ts) and everything else that reads
// (store-reads.ts). Takes the client as a parameter so tests can run it against a throwaway in-memory Postgres (PGlite).

export { TicketError } from "./ticket-error";
export { readWhere, scopeWhere } from "./scope";
export { PAGE_SIZE, type ViewPatch } from "./list-filter";
export { PENDING_TTL_MS } from "./pending-uploads";

export function ticketStore(db: PrismaClient, now: () => Date = () => new Date()) {
  return {
    ...ticketChanges(db, now),
    pending: pendingUploads(db, now),
    ...ticketLists(db),
    ...ticketReads(db),
  };
}

export type TicketStore = ReturnType<typeof ticketStore>;
export type TicketDetail = NonNullable<Awaited<ReturnType<TicketStore["get"]>>>;
export type TicketListRow = Awaited<ReturnType<TicketStore["list"]>>["rows"][number];
