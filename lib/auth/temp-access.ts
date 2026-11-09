// Temporary access: an admin lends someone chosen admin features (GRANTABLE) for 1–72 hours. It needs no clean-up to
// end: a grant past its `expiresAt` is ignored when the session is read, and the daily clean-up deletes it later.

import type { PrismaClient } from "@/lib/generated/prisma/client";
import { isGrantable, type GrantableAction } from "./permissions";

export const MAX_TEMP_HOURS = 72;
const HOUR_MS = 60 * 60 * 1000;

export type TempGrant = { actions: GrantableAction[]; expiresAt: Date };

/** What a stored grant lends right now: nothing once it has run out, and only names that are still grantable. */
export function liveGrant(row: { actions: string[]; expiresAt: Date } | null | undefined, now: Date): TempGrant | null {
  if (!row || row.expiresAt.getTime() <= now.getTime()) return null;
  const actions = [...new Set(row.actions.filter(isGrantable))];
  return actions.length ? { actions, expiresAt: row.expiresAt } : null;
}

export class TempAccessError extends Error {}

export function tempAccessStore(db: PrismaClient, now: () => Date = () => new Date()) {
  return {
    /**
     * Gives `userId` the features for `hours` from now, replacing any earlier temporary access. `granterId` must be
     * a real admin (the caller checks users.manage). Admins already have everything, so they can't be given it.
     */
    async give(granterId: string, input: { userId: string; actions: string[]; hours: number }): Promise<TempGrant> {
      const actions = [...new Set(input.actions)];
      if (!actions.length) throw new TempAccessError("Tick at least one feature.");
      if (!actions.every(isGrantable)) throw new TempAccessError("One of the features can't be given as temporary access.");
      if (!Number.isInteger(input.hours) || input.hours < 1 || input.hours > MAX_TEMP_HOURS) {
        throw new TempAccessError(`Choose from 1 to ${MAX_TEMP_HOURS} hours.`);
      }
      if (input.userId === granterId) throw new TempAccessError("You can't give temporary access to yourself.");
      const user = await db.user.findUnique({ where: { id: input.userId }, select: { role: true, active: true, pending: true } });
      if (!user) throw new TempAccessError("The user no longer exists. Refresh the page.");
      if (user.pending || !user.active) throw new TempAccessError("Turn the account on first.");
      if (user.role === "ADMIN") throw new TempAccessError("Admins already have every feature.");

      const expiresAt = new Date(now().getTime() + input.hours * HOUR_MS);
      const data = { actions, expiresAt, grantedById: granterId, createdAt: now() };
      await db.tempAccess.upsert({ where: { userId: input.userId }, create: { userId: input.userId, ...data }, update: data });
      return { actions, expiresAt };
    },

    /** Ends it now. False when there was nothing to end. */
    async end(userId: string): Promise<boolean> {
      const r = await db.tempAccess.deleteMany({ where: { userId } });
      return r.count === 1;
    },

    /** Everyone's live temporary access, by user id, for Admin → Users. */
    async live(): Promise<Map<string, TempGrant>> {
      const rows = await db.tempAccess.findMany({ where: { expiresAt: { gt: now() } }, select: { userId: true, actions: true, expiresAt: true } });
      const out = new Map<string, TempGrant>();
      for (const r of rows) {
        const g = liveGrant(r, now());
        if (g) out.set(r.userId, g);
      }
      return out;
    },

    /** For the daily clean-up. */
    async sweep(): Promise<number> {
      return (await db.tempAccess.deleteMany({ where: { expiresAt: { lte: now() } } })).count;
    },
  };
}
