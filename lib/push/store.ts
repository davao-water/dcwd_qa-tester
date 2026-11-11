import type { PrismaClient } from "@/lib/generated/prisma/client";
import type { PushSubscriptionInput, WorkHoursInput } from "@/lib/schemas/push";
import { effectiveTone, isTone } from "./tones";

/** Each person's devices and work hours. Every call takes the user id from the session, so people manage only their own. */
export function pushStore(db: PrismaClient) {
  return {
    /** Turn on for a device. The same browser subscribing again (or after a sign-in as someone else) takes over the row. */
    async subscribe(userId: string, sub: PushSubscriptionInput, device: string): Promise<void> {
      const data = { userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth, device };
      await db.pushSubscription.upsert({ where: { endpoint: sub.endpoint }, create: { endpoint: sub.endpoint, ...data }, update: data });
    },

    async unsubscribe(userId: string, endpoint: string): Promise<void> {
      await db.pushSubscription.deleteMany({ where: { userId, endpoint } });
    },

    /** Turns notifications off on every one of this person's devices (Users → Sign out all devices, for a lost phone). */
    async forgetDevices(userId: string): Promise<void> {
      await db.pushSubscription.deleteMany({ where: { userId } });
    },

    /** Whether this device is on for this person (the browser may still hold a subscription the server dropped). */
    async has(userId: string, endpoint: string): Promise<boolean> {
      return (await db.pushSubscription.count({ where: { userId, endpoint } })) > 0;
    },

    async devices(userId: string) {
      return db.pushSubscription.findMany({ where: { userId }, select: { id: true, device: true, createdAt: true, lastSentAt: true }, orderBy: { createdAt: "asc" } });
    },

    async workHours(userId: string) {
      return db.user.findUniqueOrThrow({ where: { id: userId }, select: { offHoursPush: true, workStartMin: true, workEndMin: true, workDays: true } });
    },

    async setWorkHours(userId: string, w: WorkHoursInput): Promise<void> {
      await db.user.update({ where: { id: userId }, data: w });
    },

    /** Their sound choice. */
    async tone(userId: string): Promise<{ tone: string }> {
      const u = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { notifyTone: true } });
      return { tone: effectiveTone(u) };
    },

    /** Returns false for a choice that isn't in the list. */
    async setTone(userId: string, tone: string): Promise<boolean> {
      if (!isTone(tone)) return false;
      await db.user.update({ where: { id: userId }, data: { notifyTone: tone } });
      return true;
    },

    async previews(userId: string): Promise<boolean> {
      return (await db.user.findUniqueOrThrow({ where: { id: userId }, select: { pushPreviews: true } })).pushPreviews;
    },

    async setPreviews(userId: string, on: boolean): Promise<void> {
      await db.user.update({ where: { id: userId }, data: { pushPreviews: on } });
    },
  };
}
