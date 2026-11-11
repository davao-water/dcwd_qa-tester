import type { PrismaClient } from "@/lib/generated/prisma/client";
import { can } from "@/lib/auth/permissions";
import type { TicketCreate, TicketEdit, TransitionInput } from "@/lib/schemas/ticket";
import { storeLookups } from "./store-lookups";
import { TicketError } from "./ticket-error";
import {
  canAssign,
  canCategorize,
  canDeleteTicket,
  canEditTicket,
  canHandBack,
  CATEGORY_LABELS,
  DEVICE_LABELS,
  isDone,
  NO_CATEGORY,
  PRIORITY_LABELS,
  SEVERITY_LABELS,
  transitionError,
  TYPE_LABELS,
  type Actor,
  type DeviceType,
  type SeverityValue,
  type TicketCategoryValue,
} from "./workflow";

// Every change to a ticket. Each one writes its timeline events and bumps lastActivityAt in the same transaction.

/** Setting row holding the last ticket number handed out. */
const NUMBER_KEY = "tickets.lastNumber";

const isUniqueClash = (e: unknown) => (e as { code?: unknown } | null)?.code === "P2002";

export function ticketChanges(db: PrismaClient, now: () => Date) {
  const { load, loadToRead, assigneeName, areaLabel, uploadCount, claimUploads, touch } = storeLookups(db);

  return {
    async create(actor: Actor, input: TicketCreate, uploadIds: string[] = []): Promise<{ id: string; number: number }> {
      if (!can(actor, "tickets.create")) throw new TicketError("You can't file tickets.");
      const ids = uploadCount(uploadIds);
      if (input.assigneeId && !canAssign(actor)) throw new TicketError("Only QA testers and admins pick the developer.");
      const assignee = await assigneeName(input.assigneeId);
      await areaLabel(input.areaId);

      // Numbers are never reused, even after a delete: the last one handed out is kept in Setting. Two people saving
      // at the same moment can clash on the unique index, so retry.
      for (let attempt = 0; ; attempt++) {
        try {
          return await db.$transaction(async (tx) => {
            const at = now();
            const [last, seq] = await Promise.all([
              tx.ticket.aggregate({ _max: { number: true } }),
              tx.setting.findUnique({ where: { key: NUMBER_KEY } }),
            ]);
            const number = Math.max(last._max.number ?? 0, typeof seq?.value === "number" ? seq.value : 0) + 1;
            await tx.setting.upsert({ where: { key: NUMBER_KEY }, update: { value: number }, create: { key: NUMBER_KEY, value: number } });
            const t = await tx.ticket.create({
              data: {
                number,
                type: input.type,
                title: input.title,
                description: input.description,
                areaId: input.areaId,
                severity: input.severity,
                priority: input.priority,
                foundIn: input.foundIn,
                deviceType: input.deviceType,
                category: input.category ?? null,
                reporterId: actor.id,
                assigneeId: input.assigneeId,
                createdAt: at,
                lastActivityAt: at,
                lastActivityById: actor.id,
              },
            });
            await claimUploads(tx, actor, t.id, ids);
            await tx.ticketEvent.create({ data: { ticketId: t.id, actorId: actor.id, kind: "CREATED", createdAt: at } });
            if (assignee) await tx.ticketEvent.create({ data: { ticketId: t.id, actorId: actor.id, kind: "ASSIGNEE", to: assignee, createdAt: at } });
            return { id: t.id, number: t.number };
          });
        } catch (e) {
          if (isUniqueClash(e) && attempt < 3) continue;
          throw e;
        }
      }
    },

    /** Saves changed fields and writes one FIELD event per change. Returns how many fields changed. */
    async update(actor: Actor, id: string, input: TicketEdit): Promise<number> {
      const t = await load(id, actor);
      if (!canEditTicket(t, actor)) throw new TicketError("Only the person who filed this ticket, or an admin, can edit it.");

      const sev = (s: string | null) => (s ? SEVERITY_LABELS[s as SeverityValue] : null);
      const device = (d: string | null) => (d ? DEVICE_LABELS[d as DeviceType] : null);
      const changes: { field: string; from?: string | null; to?: string | null }[] = [];
      if (input.type !== t.type) changes.push({ field: "type", from: TYPE_LABELS[t.type], to: TYPE_LABELS[input.type] });
      if (input.title !== t.title) changes.push({ field: "title", from: t.title, to: input.title });
      if (input.description !== t.description) changes.push({ field: "description" });
      if (input.areaId !== t.areaId) changes.push({ field: "module", from: await areaLabel(t.areaId).catch(() => null), to: await areaLabel(input.areaId) });
      if (input.severity !== t.severity) changes.push({ field: "severity", from: sev(t.severity), to: sev(input.severity) });
      if (input.priority !== t.priority) changes.push({ field: "priority", from: PRIORITY_LABELS[t.priority], to: PRIORITY_LABELS[input.priority] });
      if (input.foundIn !== t.foundIn) changes.push({ field: "found in", from: t.foundIn, to: input.foundIn });
      if (input.deviceType !== t.deviceType) changes.push({ field: "device type", from: device(t.deviceType), to: device(input.deviceType) });
      if (!changes.length) return 0;

      await db.$transaction(async (tx) => {
        const at = now();
        await touch(tx, actor, id, at, input);
        await tx.ticketEvent.createMany({ data: changes.map((c) => ({ ticketId: id, actorId: actor.id, kind: "FIELD", ...c, createdAt: at })) });
      });
      return changes.length;
    },

    /**
     * Corrects or sets the category. It leaves a line in the log but marks nothing unread and sends nothing: a developer tagging
     * older tickets would otherwise flood QA testers.
     */
    async categorize(actor: Actor, id: string, category: TicketCategoryValue): Promise<void> {
      const t = await load(id, actor);
      if (!canCategorize(t, actor)) throw new TicketError("Only the assigned developer or an admin can change the category.");
      if (t.category === category) return;
      await db.$transaction(async (tx) => {
        await tx.ticket.update({ where: { id }, data: { category } });
        await tx.ticketEvent.create({
          data: { ticketId: id, actorId: actor.id, kind: "FIELD", field: "category", from: t.category ? CATEGORY_LABELS[t.category] : NO_CATEGORY, to: CATEGORY_LABELS[category], createdAt: now() },
        });
      });
    },

    /** Assigns or reassigns the developer; `note` is an optional reason, shown on the timeline line. */
    async assign(actor: Actor, id: string, assigneeId: string | null, note?: string | null): Promise<void> {
      if (!canAssign(actor)) throw new TicketError("Only QA testers and admins assign tickets.");
      const t = await load(id, actor);
      if (t.assigneeId === assigneeId) return;
      const [from, to] = await Promise.all([
        t.assigneeId ? db.user.findUnique({ where: { id: t.assigneeId }, select: { name: true } }).then((u) => u?.name ?? null) : null,
        assigneeName(assigneeId),
      ]);
      await db.$transaction(async (tx) => {
        const at = now();
        await touch(tx, actor, id, at, { assigneeId });
        await tx.ticketEvent.create({ data: { ticketId: id, actorId: actor.id, kind: "ASSIGNEE", from, to, note: note?.trim() || null, createdAt: at } });
      });
    },

    async transition(actor: Actor, id: string, input: TransitionInput): Promise<void> {
      const t = await load(id, actor);
      const problem = transitionError(t, actor, input);
      if (problem) throw new TicketError(problem);

      let duplicateOfId: string | null | undefined;
      let note = input.note;
      if (input.to === "DUPLICATE") {
        const dup = await db.ticket.findUnique({ where: { number: input.duplicateOf! }, select: { id: true, number: true } });
        if (!dup) throw new TicketError(`There is no ticket #${input.duplicateOf}.`);
        if (dup.id === id) throw new TicketError("A ticket can't be a duplicate of itself.");
        duplicateOfId = dup.id;
        note = note ? `Duplicate of #${dup.number}. ${note}` : `Duplicate of #${dup.number}.`;
      } else if (t.status === "DUPLICATE") {
        // Reopened or taken back: no longer a duplicate.
        duplicateOfId = null;
      }

      await db.$transaction(async (tx) => {
        const at = now();
        // Only move it if nobody else changed the status since this page was loaded.
        const moved = await tx.ticket.updateMany({
          where: { id, status: t.status },
          data: { status: input.to, closedAt: isDone(input.to) ? at : null, lastActivityAt: at, lastActivityById: actor.id, ...(duplicateOfId !== undefined ? { duplicateOfId } : {}) },
        });
        if (moved.count === 0) throw new TicketError("Someone else just changed this ticket. Refresh the page and try again.");
        await tx.ticketEvent.create({ data: { ticketId: id, actorId: actor.id, kind: "STATUS", from: t.status, to: input.to, note, createdAt: at } });
      });
    },

    /**
     * Won't fix → "Another developer should take it": the ticket goes back to QA unassigned, still open, with who the
     * developer recommends (optional) and why. In progress goes back to New; other open statuses stay. QA assigns it.
     */
    async handBack(actor: Actor, id: string, input: { recommendId: string | null; note: string }): Promise<{ recommended: string | null }> {
      const t = await load(id, actor);
      if (!canHandBack(t, actor)) throw new TicketError("Only the assigned developer can hand this ticket back, while it is still open.");
      const note = input.note.trim();
      if (!note) throw new TicketError("Add a note explaining why.");
      if (input.recommendId === actor.id || input.recommendId === t.assigneeId) throw new TicketError("Recommend a different developer, or leave it for QA to pick.");
      const recommended = await assigneeName(input.recommendId);
      const from = t.assigneeId ? ((await db.user.findUnique({ where: { id: t.assigneeId }, select: { name: true } }))?.name ?? null) : null;
      const status = t.status === "IN_PROGRESS" ? "NEW" : t.status;
      const why = recommended ? `Recommends ${recommended}. ${note}` : `Needs another developer. ${note}`;

      await db.$transaction(async (tx) => {
        const at = now();
        // Only if nobody changed it since this page was loaded.
        const moved = await tx.ticket.updateMany({
          where: { id, status: t.status, assigneeId: t.assigneeId },
          data: { assigneeId: null, status, lastActivityAt: at, lastActivityById: actor.id },
        });
        if (moved.count === 0) throw new TicketError("Someone else just changed this ticket. Refresh the page and try again.");
        await tx.ticketEvent.create({ data: { ticketId: id, actorId: actor.id, kind: "ASSIGNEE", from, to: null, note: why, createdAt: at } });
        if (status !== t.status) await tx.ticketEvent.create({ data: { ticketId: id, actorId: actor.id, kind: "STATUS", from: t.status, to: status, note: why, createdAt: at } });
      });
      return { recommended };
    },

    async comment(actor: Actor, id: string, body: string, uploadIds: string[] = []): Promise<string> {
      if (!can(actor, "tickets.comment")) throw new TicketError("You can't comment on tickets.");
      const ids = uploadCount(uploadIds);
      if (!body.trim() && ids.length === 0) throw new TicketError("Write a message or attach an image or video.");
      await loadToRead(id, actor);
      return db.$transaction(async (tx) => {
        const at = now();
        const c = await tx.ticketComment.create({ data: { ticketId: id, authorId: actor.id, body: body.trim(), createdAt: at } });
        await claimUploads(tx, actor, id, ids, c.id);
        await touch(tx, actor, id, at);
        return c.id;
      });
    },


    /** Permanently deletes a ticket with its thread, log and attachment rows. Returns the files to remove from Storage. */
    async delete(actor: Actor, id: string, typedTitle: string): Promise<{ number: number; files: { storedName: string }[] }> {
      const t = await load(id, actor);
      if (!canDeleteTicket(t, actor)) throw new TicketError("Only the QA tester who filed this ticket, or an admin, can delete it.");
      if (typedTitle.trim() !== t.title) throw new TicketError("The title you typed doesn't match. Type it exactly as shown.");
      const files = await db.attachment.findMany({ where: { ticketId: id }, select: { storedName: true } });
      await db.ticket.delete({ where: { id } }); // comments, events and attachment rows cascade
      return { number: t.number, files };
    },
  };
}
