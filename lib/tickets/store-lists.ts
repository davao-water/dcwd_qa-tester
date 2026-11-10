import type { PrismaClient } from "@/lib/generated/prisma/client";
import type { TicketFilters } from "@/lib/schemas/ticket";
import { BOARD_COLUMN_LIMIT, BOARD_COLUMNS } from "./board";
import { byActivity, listFilters, listSelect, PAGE_SIZE, type ViewPatch } from "./list-filter";
import type { Actor, TicketStatus } from "./workflow";

/** The Tickets page: the list, the count on each view tab, and the board. */
export function ticketLists(db: PrismaClient) {
  const { withSubModules, filterWhere } = listFilters(db);

  return {
    /** The tickets `actor` may see, narrowed by the list filters. */
    async list(f: TicketFilters, actor: Actor) {
      const where = await filterWhere(f, actor);
      const [total, rows] = await Promise.all([
        db.ticket.count({ where }),
        db.ticket.findMany({ where, orderBy: byActivity, skip: (f.page - 1) * PAGE_SIZE, take: PAGE_SIZE, select: listSelect }),
      ]);
      return { total, rows };
    },

    /**
     * How many tickets each view tab would show, with the other filters (search, type, module, category) as they are now.
     * A view sets its own stage and people, exactly as clicking its tab does, so the number matches what opens.
     */
    async viewCounts(f: TicketFilters, actor: Actor, views: ViewPatch[]): Promise<number[]> {
      // The module filter is the same for every tab, so it is looked up once.
      const areaIds = f.area ? await withSubModules(f.area) : undefined;
      return Promise.all(views.map(async (v) => db.ticket.count({ where: await filterWhere({ ...f, ...v, page: 1 }, actor, areaIds) })));
    },

    /**
     * The Board view: the same tickets as the list with the same filters, one column per stage, the most recently
     * active first. `total` counts the column's tickets, including any past its limit.
     */
    async board(f: TicketFilters, actor: Actor) {
      const where = await filterWhere(f, actor);
      const [counts, columns] = await Promise.all([
        db.ticket.groupBy({ by: ["status"], where, _count: { _all: true } }),
        Promise.all(
          BOARD_COLUMNS.map((c) =>
            db.ticket.findMany({
              where: { AND: [where, { status: { in: [...c.statuses] } }] },
              orderBy: byActivity,
              take: BOARD_COLUMN_LIMIT,
              select: listSelect,
            }),
          ),
        ),
      ]);
      const count = (s: TicketStatus) => counts.find((c) => c.status === s)?._count._all ?? 0;
      return BOARD_COLUMNS.map((c, i) => ({ key: c.key, total: c.statuses.reduce((n, s) => n + count(s), 0), rows: columns[i] }));
    },
  };
}
