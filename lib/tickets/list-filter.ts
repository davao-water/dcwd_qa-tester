import type { Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import { AREA_PATH_SELECT, descendantIds } from "@/lib/areas/tree";
import type { TicketFilters } from "@/lib/schemas/ticket";
import { readWhere, scopeWhere } from "./scope";
import { DONE_STATUSES, OPEN_STATUSES, TO_START, TO_START_STATUSES, type Actor, type TicketStatus } from "./workflow";

// How the Tickets list and board pick their tickets: the filters from the address, what a row shows, and the order.

export const PAGE_SIZE = 50;

/** What a view tab on the Tickets page sets: its stage and its people (see viewCounts). */
export type ViewPatch = Pick<TicketFilters, "group" | "status" | "assignee" | "reporter">;

/** Midnight at the start of a YYYY-MM-DD day in Manila (UTC+8, no daylight saving). */
const manilaDay = (day: string, addDays = 0) => new Date(Date.parse(`${day}T00:00:00+08:00`) + addDays * 86_400_000);

/** What a row of the list, or a card on the board, shows. */
export const listSelect = {
  id: true,
  number: true,
  type: true,
  title: true,
  status: true,
  severity: true,
  priority: true,
  category: true,
  createdAt: true,
  lastActivityAt: true,
  areaId: true,
  area: { select: AREA_PATH_SELECT },
  assignee: { select: { id: true, name: true } },
  reporter: { select: { id: true, name: true } },
  _count: { select: { comments: true } },
} satisfies Prisma.TicketSelect;

export const byActivity = [{ lastActivityAt: "desc" }, { number: "desc" }] satisfies Prisma.TicketOrderByWithRelationInput[];

export function listFilters(db: PrismaClient) {
  /** A module and everything inside it, at every level, for the module filter. */
  async function withSubModules(areaId: string): Promise<string[]> {
    const all = await db.erpArea.findMany({ select: { id: true, parentId: true } });
    return descendantIds(all, areaId);
  }

  /** The list (and board) filters, within what `actor` may see. `areaIds`: the module filter, already looked up. */
  async function filterWhere(f: TicketFilters, actor: Actor, areaIds?: string[]): Promise<Prisma.TicketWhereInput> {
    const filters: Prisma.TicketWhereInput = {};
    if (f.status === TO_START) filters.status = { in: [...TO_START_STATUSES] };
    else if (f.status) filters.status = f.status;
    else if (f.group !== "all") filters.status = { in: [...(f.group === "open" ? OPEN_STATUSES : DONE_STATUSES)] as TicketStatus[] };
    if (f.type) filters.type = f.type;
    if (f.category) filters.category = f.category === "none" ? null : f.category;
    if (f.area) filters.areaId = { in: areaIds ?? (await withSubModules(f.area)) };
    if (f.assignee === "none") filters.assigneeId = null;
    else if (f.assignee) filters.assigneeId = f.assignee === "me" ? actor.id : f.assignee;
    if (f.reporter) filters.reporterId = f.reporter === "me" ? actor.id : f.reporter;
    if (f.severity) filters.severity = f.severity;
    if (f.priority) filters.priority = f.priority;
    if (f.from || f.to) filters.createdAt = { ...(f.from ? { gte: manilaDay(f.from) } : {}), ...(f.to ? { lt: manilaDay(f.to, 1) } : {}) };
    if (f.q) {
      const num = /^#?(\d{1,9})$/.exec(f.q);
      filters.OR = [{ title: { contains: f.q, mode: "insensitive" } }, { description: { contains: f.q, mode: "insensitive" } }, ...(num ? [{ number: Number(num[1]) }] : [])];
    }
    // AND, so a filter can only narrow the person's scope, never widen it. The All tab reads every ticket; the other
    // tabs are the person's own.
    return { AND: [f.group === "all" ? readWhere(actor) : scopeWhere(actor), filters] };
  }

  return { withSubModules, filterWhere };
}
