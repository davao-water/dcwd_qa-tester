import type { Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import { notificationStore } from "@/lib/tickets/notifications";
import { scopeWhere } from "@/lib/tickets/scope";
import { STATUS_LABELS, type Actor, type TicketStatus } from "@/lib/tickets/workflow";

// My inbox (Messenger-style): one conversation per ticket the person can see, newest activity first, with a preview of
// the last thing said or done. Ticket text stays on our server; nothing here goes to an AI model (CLAUDE.md rule 1).

export const INBOX_PAGE = 40;

export type InboxThread = {
  id: string;
  number: number;
  title: string;
  status: TicketStatus;
  lastActivityAt: Date;
  /** "Ben: Fixed on dev…" or "Ana moved it to Fixed". */
  preview: string;
  unread: boolean;
  /** Replies by others not seen yet. */
  unreadMessages: number;
};

type LastEvent = { kind: string; field: string | null; from: string | null; to: string | null; createdAt: Date; actor: { name: string } };

/** One line for a timeline event, the way the ticket page words it. */
export function describeEvent(e: LastEvent): string {
  const label = (s: string | null) => (s ? (STATUS_LABELS[s as TicketStatus] ?? s) : "?");
  if (e.kind === "CREATED") return `${e.actor.name} filed it`;
  if (e.kind === "STATUS") return `${e.actor.name} moved it to ${label(e.to)}`;
  if (e.kind === "ASSIGNEE") return e.to ? `${e.actor.name} assigned it to ${e.to}` : `${e.actor.name} unassigned ${e.from ?? "the developer"}`;
  if (e.kind === "FIELD") return e.field === "description" ? `${e.actor.name} edited the description` : `${e.actor.name} changed the ${e.field}`;
  return `${e.actor.name} updated it`;
}

/** The newer of the last reply and the last event, as one short line. */
export function previewOf(comment: { body: string; createdAt: Date; author: { name: string }; files: number } | null, event: LastEvent | null): string {
  if (comment && (!event || comment.createdAt >= event.createdAt)) {
    const text = comment.body.replace(/\s+/g, " ").trim();
    const what = text || (comment.files === 1 ? "sent a file" : `sent ${comment.files} files`);
    return `${comment.author.name}: ${what}`;
  }
  return event ? describeEvent(event) : "";
}

export function inboxStore(db: PrismaClient) {
  const notifications = notificationStore(db);

  return {
    /** How many conversations the Unread view holds, for the number beside it. */
    async unreadCount(actor: Actor): Promise<number> {
      return (await notifications.allUnreadIds(actor)).length;
    },

    async threads(actor: Actor, opts: { q?: string; unreadOnly?: boolean; take?: number } = {}): Promise<{ threads: InboxThread[]; more: boolean }> {
      const take = opts.take ?? INBOX_PAGE;
      const filters: Prisma.TicketWhereInput[] = [scopeWhere(actor)];
      const q = opts.q?.trim();
      if (q) {
        const num = /^#?(\d{1,9})$/.exec(q);
        filters.push({ OR: [{ title: { contains: q, mode: "insensitive" } }, ...(num ? [{ number: Number(num[1]) }] : [])] });
      }
      if (opts.unreadOnly) filters.push({ id: { in: await notifications.allUnreadIds(actor) } });

      const rows = await db.ticket.findMany({
        where: { AND: filters },
        orderBy: [{ lastActivityAt: "desc" }, { number: "desc" }],
        take: take + 1,
        select: {
          id: true,
          number: true,
          title: true,
          status: true,
          lastActivityAt: true,
          comments: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { body: true, createdAt: true, author: { select: { name: true } }, _count: { select: { attachments: true } } },
          },
          events: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { kind: true, field: true, from: true, to: true, createdAt: true, actor: { select: { name: true } } },
          },
        },
      });
      const page = rows.slice(0, take);
      const ids = page.map((r) => r.id);
      const [unread, messages] = await Promise.all([notifications.unreadIds(actor, ids), notifications.unreadMessages(actor, ids)]);

      return {
        more: rows.length > take,
        threads: page.map((r) => {
          const c = r.comments[0];
          return {
            id: r.id,
            number: r.number,
            title: r.title,
            status: r.status,
            lastActivityAt: r.lastActivityAt,
            preview: previewOf(c ? { body: c.body, createdAt: c.createdAt, author: c.author, files: c._count.attachments } : null, r.events[0] ?? null),
            unread: unread.has(r.id),
            unreadMessages: messages.get(r.id) ?? 0,
          };
        }),
      };
    },
  };
}
