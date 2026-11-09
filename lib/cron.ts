import { createHash, timingSafeEqual } from "node:crypto";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { RATE_LIMIT_KEEP_MS } from "@/lib/auth/rate-limit";
import { tempAccessStore } from "@/lib/auth/temp-access";
import { ticketStore } from "@/lib/tickets/store";

/**
 * Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. Anything else, or no secret configured, is refused.
 * Both sides are hashed first so the comparison takes the same time whatever the input's length.
 */
export function cronAuthorized(header: string | null, secret: string | undefined): boolean {
  if (!secret || secret.length < 16 || !header) return false;
  const digest = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(digest(header), digest(`Bearer ${secret}`));
}

/**
 * The daily clean-up: uploads nobody sent, expired sessions, old rate-limit hits and ended temporary access. Returns the Storage objects to
 * delete (the caller does that, so this stays testable without Storage) and what it removed.
 */
export async function dailyCleanup(db: PrismaClient, now = new Date()) {
  const stale = await ticketStore(db, () => now).pending.sweep();
  const sessions = await db.session.deleteMany({ where: { expiresAt: { lt: now } } });
  const hits = await db.rateLimitHit.deleteMany({ where: { at: { lt: new Date(now.getTime() - RATE_LIMIT_KEEP_MS) } } });
  const tempAccess = await tempAccessStore(db, () => now).sweep();
  return { staleFiles: stale.map((s) => s.storedName), removed: { uploads: stale.length, sessions: sessions.count, rateLimitHits: hits.count, tempAccess } };
}
