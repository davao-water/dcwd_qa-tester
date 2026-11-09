import type { Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import { AREA_PATH_SELECT, areaPath, descendantIds } from "@/lib/areas/tree";
import { can } from "@/lib/auth/permissions";
import type { TicketCreate, TicketEdit, TicketFilters, TransitionInput } from "@/lib/schemas/ticket";
import { MAX_IMAGES_PER_POST, MAX_PENDING_PER_USER, MAX_VIDEOS_PER_POST, type UploadKind } from "@/lib/uploads/limits";
import { BOARD_COLUMN_LIMIT, BOARD_COLUMNS } from "./board";
import { memberModules, moduleProgress as buildModuleProgress } from "./progress";
import {
  canAssign,
  canCategorize,
  canHandBack,
  canReadTicket,
  CATEGORY_LABELS,
  NO_CATEGORY,
  type TicketCategoryValue,
  canDeleteTicket,
  canEditTicket,
  DONE_STATUSES,
  TO_START,
  TO_START_STATUSES,
  isDone,
  OPEN_STATUSES,
  PRIORITY_LABELS,
  DEVICE_LABELS,
  SEVERITY_LABELS,
  ticketScope,
  transitionError,
  TYPE_LABELS,
  type Actor,
  type DeviceType,
  type SeverityValue,
  type TicketStatus,
} from "./workflow";

// Prisma glue for tickets. Every change writes its timeline events and bumps lastActivityAt in the same transaction.
// Takes the client as a parameter so tests can run it against a throwaway in-memory Postgres (PGlite).

/** A refusal the user can act on. Server Actions show its message as is. */
export class TicketError extends Error {}

export const PAGE_SIZE = 50;

/** What a view tab on the Tickets page sets: its stage and its people (see viewCounts). */
export type ViewPatch = Pick<TicketFilters, "group" | "status" | "assignee" | "reporter">;

/** Uploads never sent with a ticket or reply are removed after this long. */
export const PENDING_TTL_MS = 24 * 60 * 60 * 1000;

/** Setting row holding the last ticket number handed out. */
const NUMBER_KEY = "tickets.lastNumber";

const isUniqueClash = (e: unknown) => (e as { code?: unknown } | null)?.code === "P2002";

type Tx = Prisma.TransactionClient;

/** The Prisma filter for the tickets `actor` may see (see ticketScope). */
export function scopeWhere(actor: Actor): Prisma.TicketWhereInput {
  const s = ticketScope(actor);
  return s === "all" ? {} : s;
}

/** The Prisma filter for the tickets `actor` may read: every ticket, for anyone who may view tickets (see canReadTicket). */
export function readWhere(actor: Actor): Prisma.TicketWhereInput {
  return canReadTicket(actor) ? {} : { id: { in: [] } };
}

/** Midnight at the start of a YYYY-MM-DD day in Manila (UTC+8, no daylight saving). */
const manilaDay = (day: string, addDays = 0) => new Date(Date.parse(`${day}T00:00:00+08:00`) + addDays * 86_400_000);

/** What a row of the list, or a card on the board, shows. */
const listSelect = {
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

const byActivity = [{ lastActivityAt: "desc" }, { number: "desc" }] satisfies Prisma.TicketOrderByWithRelationInput[];

export function ticketStore(db: PrismaClient, now: () => Date = () => new Date()) {
  /** A ticket the actor may see. Someone else's ticket gets the same answer as a missing one. */
  async function load(id: string, actor: Actor) {
    const t = await db.ticket.findFirst({ where: { id, ...scopeWhere(actor) } });
    if (!t) throw new TicketError("This ticket no longer exists. Refresh the page.");
    return t;
  }

  /** A ticket the actor may read and reply to: any ticket, from the All tab. */
  async function loadToRead(id: string, actor: Actor) {
    const t = await db.ticket.findFirst({ where: { id, ...readWhere(actor) }, select: { id: true } });
    if (!t) throw new TicketError("This ticket no longer exists. Refresh the page.");
    return t;
  }

  /** The assignee must be an active developer (not QA, not an admin). Returns their name for the timeline. */
  async function assigneeName(assigneeId: string | null): Promise<string | null> {
    if (!assigneeId) return null;
    const u = await db.user.findUnique({ where: { id: assigneeId }, select: { name: true, role: true, active: true } });
    if (!u || !u.active || u.role !== "DEV") throw new TicketError("Pick an active developer to assign.");
    return u.name;
  }

  async function areaLabel(areaId: string | null): Promise<string | null> {
    if (!areaId) return null;
    const a = await db.erpArea.findUnique({ where: { id: areaId }, select: AREA_PATH_SELECT });
    if (!a) throw new TicketError("That module no longer exists. Refresh the page.");
    return areaPath(a);
  }

  /** Checks the upload ids a form sent before any transaction starts: at most 6 images and 1 video. */
  function uploadCount(uploadIds: string[]) {
    const ids = [...new Set(uploadIds)];
    if (ids.length > MAX_IMAGES_PER_POST + MAX_VIDEOS_PER_POST) throw new TicketError(`Attach at most ${MAX_IMAGES_PER_POST} images and ${MAX_VIDEOS_PER_POST} video at a time.`);
    return ids;
  }

  /**
   * Turns the actor's own finished uploads into attachments of this ticket (or reply), inside the caller's
   * transaction. Someone else's upload, an unfinished one, or one already swept, is refused.
   */
  async function claimUploads(tx: Tx, actor: Actor, ticketId: string, uploadIds: string[], commentId?: string) {
    if (!uploadIds.length) return;
    const ids = [...new Set(uploadIds)];
    const rows = await tx.pendingUpload.findMany({ where: { id: { in: ids }, uploaderId: actor.id, status: "READY" } });
    if (rows.length !== ids.length) throw new TicketError("An upload has expired or didn't finish. Remove it and add it again.");
    const count = (k: UploadKind) => rows.filter((r) => r.kind === k).length;
    if (count("IMAGE") > MAX_IMAGES_PER_POST) throw new TicketError(`Attach at most ${MAX_IMAGES_PER_POST} images at a time.`);
    if (count("VIDEO") > MAX_VIDEOS_PER_POST) throw new TicketError(`Attach at most ${MAX_VIDEOS_PER_POST} video at a time.`);
    await tx.attachment.createMany({
      data: rows.map((r) => ({
        ticketId,
        commentId: commentId ?? null,
        uploaderId: actor.id,
        kind: r.kind,
        storedName: r.storedName,
        originalName: r.originalName,
        mime: r.mime,
        size: r.size,
        durationSec: r.durationSec,
      })),
    });
    await tx.pendingUpload.deleteMany({ where: { id: { in: ids } } });
  }

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

  /** Bumps lastActivityAt and records who did it, so everyone else sees the ticket as unread. */
  async function touch(tx: Tx, actor: Actor, id: string, at: Date, data: Prisma.TicketUncheckedUpdateInput = {}) {
    await tx.ticket.update({ where: { id }, data: { ...data, lastActivityAt: at, lastActivityById: actor.id } });
  }

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

    /** Files uploaded straight to Storage ahead of the form that will attach them (see claimUploads). */
    pending: {
      /** Records a signed upload before the browser sends the file. */
      async create(actor: Actor, f: { kind: UploadKind; storedName: string; originalName: string; mime: string; size: number }): Promise<string> {
        if (!can(actor, "tickets.comment")) throw new TicketError("You can't add files to tickets.");
        const waiting = await db.pendingUpload.count({ where: { uploaderId: actor.id } });
        if (waiting >= MAX_PENDING_PER_USER) throw new TicketError("You have too many files waiting to be sent. Send or remove some first.");
        const row = await db.pendingUpload.create({ data: { uploaderId: actor.id, ...f, status: "SIGNED", createdAt: now() } });
        return row.id;
      },

      /** The actor's own upload that is still waiting for its file, or null. */
      async signed(actor: Actor, id: string) {
        return db.pendingUpload.findFirst({ where: { id, uploaderId: actor.id, status: "SIGNED" } });
      },

      /** The file arrived and passed its checks; the form may now claim it. */
      async ready(id: string, checked: { mime: string; size: number; durationSec: number | null }): Promise<void> {
        await db.pendingUpload.update({ where: { id }, data: { ...checked, status: "READY" } });
      },

      /** Removes the actor's own pending upload. Returns its file to delete from Storage, or null. */
      async remove(actor: Actor, id: string): Promise<{ storedName: string } | null> {
        const row = await db.pendingUpload.findFirst({ where: { id, uploaderId: actor.id }, select: { storedName: true } });
        if (!row) return null;
        await db.pendingUpload.delete({ where: { id } });
        return row;
      },

      /** Drops uploads nobody sent within PENDING_TTL_MS. Returns their files to delete from Storage. */
      async sweep(): Promise<{ storedName: string }[]> {
        const where = { createdAt: { lt: new Date(now().getTime() - PENDING_TTL_MS) } };
        const stale = await db.pendingUpload.findMany({ where, select: { storedName: true } });
        if (stale.length) await db.pendingUpload.deleteMany({ where: { storedName: { in: stale.map((s) => s.storedName) } } });
        return stale;
      },
    },

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

    /** Permanently deletes a ticket with its thread, log and attachment rows. Returns the files to remove from Storage. */
    async delete(actor: Actor, id: string, typedTitle: string): Promise<{ number: number; files: { storedName: string }[] }> {
      const t = await load(id, actor);
      if (!canDeleteTicket(t, actor)) throw new TicketError("Only the QA tester who filed this ticket, or an admin, can delete it.");
      if (typedTitle.trim() !== t.title) throw new TicketError("The title you typed doesn't match. Type it exactly as shown.");
      const files = await db.attachment.findMany({ where: { ticketId: id }, select: { storedName: true } });
      await db.ticket.delete({ where: { id } }); // comments, events and attachment rows cascade
      return { number: t.number, files };
    },

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

export type TicketStore = ReturnType<typeof ticketStore>;
export type TicketDetail = NonNullable<Awaited<ReturnType<TicketStore["get"]>>>;
export type TicketListRow = Awaited<ReturnType<TicketStore["list"]>>["rows"][number];
