import type { Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import { AREA_PATH_SELECT, areaPath } from "@/lib/areas/tree";
import { MAX_IMAGES_PER_POST, MAX_VIDEOS_PER_POST, type UploadKind } from "@/lib/uploads/limits";
import { TicketError } from "./ticket-error";
import { readWhere, scopeWhere } from "./scope";
import type { Actor } from "./workflow";

export type Tx = Prisma.TransactionClient;

/** The lookups and checks every change to a ticket starts with, and the steps it shares inside its transaction. */
export function storeLookups(db: PrismaClient) {
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

  /** Bumps lastActivityAt and records who did it, so everyone else sees the ticket as unread. */
  async function touch(tx: Tx, actor: Actor, id: string, at: Date, data: Prisma.TicketUncheckedUpdateInput = {}) {
    await tx.ticket.update({ where: { id }, data: { ...data, lastActivityAt: at, lastActivityById: actor.id } });
  }

  return { load, loadToRead, assigneeName, areaLabel, uploadCount, claimUploads, touch };
}
