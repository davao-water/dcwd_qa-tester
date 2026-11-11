import type { PrismaClient } from "@/lib/generated/prisma/client";
import { AREA_PATH_SELECT } from "@/lib/areas/tree";
import { memberModules, moduleProgress as buildModuleProgress } from "./progress";
import { readWhere, scopeWhere } from "./scope";
import { DONE_STATUSES, OPEN_STATUSES, TO_START_STATUSES, type Actor, type TicketStatus } from "./workflow";

/** Reading tickets outside the Tickets page: one ticket, the dashboard numbers, module progress and the report. */
export function ticketReads(db: PrismaClient) {
  return {
    /** The numbers on each person's dashboard, within what they may see. */
    async counts(actor: Actor) {
      const mine = scopeWhere(actor);
      const open = { in: [...OPEN_STATUSES] as TicketStatus[] };
      const [open_, needInfo, toStart, fixed, done] = await Promise.all([
        db.ticket.count({ where: { ...mine, status: open } }),
        db.ticket.count({ where: { ...mine, status: "NEED_INFO" } }),
        db.ticket.count({ where: { ...mine, status: { in: [...TO_START_STATUSES] } } }),
        db.ticket.count({ where: { ...mine, status: "FIXED" } }),
        db.ticket.count({ where: { ...mine, status: { in: [...DONE_STATUSES] as TicketStatus[] } } }),
      ]);
      return { open: open_, needInfo, toStart, fixed, done };
    },

    /** Every ticket `actor` may see, closed ones included. */
    async total(actor: Actor) {
      return db.ticket.count({ where: scopeWhere(actor) });
    },

    /**
     * Module progress for every active top-level module, counted from all tickets whoever is looking: only numbers
     * leave here. `forUserId` keeps the modules that person belongs to, directly or through a sub-module.
     */
    async moduleProgress(forUserId?: string) {
      const [areas, rows, members] = await Promise.all([
        db.erpArea.findMany({ select: { id: true, name: true, parentId: true, active: true } }),
        db.ticket.findMany({
          where: { areaId: { not: null }, status: { notIn: ["REJECTED", "DUPLICATE", "WONT_FIX"] } },
          select: {
            areaId: true,
            category: true,
            status: true,
            events: { where: { kind: "STATUS", to: "CLOSED" }, orderBy: { createdAt: "desc" }, take: 1, select: { from: true } },
          },
        }),
        forUserId ? db.areaMember.findMany({ where: { userId: forUserId }, select: { areaId: true } }) : null,
      ]);
      const tickets = rows.map((t) => ({ areaId: t.areaId, category: t.category, status: t.status, closedFrom: t.status === "CLOSED" ? (t.events[0]?.from ?? null) : null }));
      const cards = buildModuleProgress(areas, tickets);
      const total = cards.length;
      if (!members) return { cards, total };
      const mine = memberModules(areas, members.map((m) => m.areaId));
      return { cards: cards.filter((c) => mine.has(c.id)), total };
    },

    /**
     * What the module report counts: every ticket's module, category and status (and how a Closed one got there), whoever
     * is looking. Only numbers leave here: no titles, text or names.
     */
    async reportRows() {
      const [areas, rows] = await Promise.all([
        db.erpArea.findMany({ select: { id: true, name: true, parentId: true, active: true } }),
        db.ticket.findMany({
          select: {
            areaId: true,
            category: true,
            status: true,
            events: { where: { kind: "STATUS", to: "CLOSED" }, orderBy: { createdAt: "desc" }, take: 1, select: { from: true } },
          },
        }),
      ]);
      return { areas, tickets: rows.map((t) => ({ areaId: t.areaId, category: t.category, status: t.status, closedFrom: t.status === "CLOSED" ? (t.events[0]?.from ?? null) : null })) };
    },

    /** The most recently active tickets `actor` may see, or the newest filed with `newest`. */
    async recent(actor: Actor, take = 6, newest = false) {
      return db.ticket.findMany({
        where: scopeWhere(actor),
        orderBy: newest ? [{ createdAt: "desc" }, { number: "desc" }] : [{ lastActivityAt: "desc" }, { number: "desc" }],
        take,
        select: {
          id: true,
          number: true,
          title: true,
          status: true,
          type: true,
          severity: true,
          priority: true,
          createdAt: true,
          lastActivityAt: true,
          area: { select: AREA_PATH_SELECT },
          assignee: { select: { name: true } },
          reporter: { select: { name: true } },
        },
      });
    },

    /** An attachment `actor` may open: it belongs to a ticket they can see. */
    async attachmentFor(actor: Actor, attachmentId: string) {
      return db.attachment.findFirst({ where: { id: attachmentId, ticket: readWhere(actor) }, select: { storedName: true, mime: true, originalName: true } });
    },

    /** A ticket by number, or null when it doesn't exist or `actor` may not read it. Changing it is checked separately. */
    async get(number: number, actor: Actor) {
      const person = { select: { id: true, name: true, role: true, avatarColor: true, avatarName: true } } as const;
      const file = {
        select: { id: true, kind: true, originalName: true, mime: true, size: true, durationSec: true, createdAt: true, uploader: { select: { name: true } } },
        orderBy: { createdAt: "asc" },
      } as const;
      return db.ticket.findFirst({
        where: { number, ...readWhere(actor) },
        include: {
          area: { select: { id: true, ...AREA_PATH_SELECT } },
          reporter: person,
          assignee: person,
          duplicateOf: { select: { number: true, title: true } },
          attachments: { ...file, where: { commentId: null } },
          comments: { orderBy: { createdAt: "asc" }, include: { author: person, attachments: file } },
          events: { orderBy: { createdAt: "asc" }, include: { actor: person } },
        },
      });
    },
  };
}
