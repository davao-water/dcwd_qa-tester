import type { PrismaClient } from "@/lib/generated/prisma/client";
import { can } from "@/lib/auth/permissions";
import { MAX_PENDING_PER_USER, type UploadKind } from "@/lib/uploads/limits";
import { TicketError } from "./ticket-error";
import type { Actor } from "./workflow";

/** Uploads never sent with a ticket or reply are removed after this long. */
export const PENDING_TTL_MS = 24 * 60 * 60 * 1000;

/** Files uploaded straight to Storage ahead of the form that will attach them (see claimUploads in store-lookups.ts). */
export function pendingUploads(db: PrismaClient, now: () => Date) {
  return {
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
  };
}
