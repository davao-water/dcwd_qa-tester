import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { notifyTicket, type PushSender } from "@/lib/push/send";
import { pushStore } from "@/lib/push/store";
import { notificationStore } from "@/lib/tickets/notifications";
import { ticketStore } from "@/lib/tickets/store";
import type { Actor } from "@/lib/tickets/workflow";
import { createTestDb } from "./helpers/test-db";
import { manila } from "./helpers/manila";

// Saved devices, sounds and work hours, and sending a ticket's notifications.

describe("pushStore and notifyTicket", () => {
  let db: PrismaClient;
  let cleanup: () => Promise<void>;
  let qa: Actor, dev: Actor, admin: Actor;
  const at = manila("2026-11-02T10:00:00");
  const sub = (n: string) => ({ endpoint: `https://fcm.googleapis.com/fcm/send/${n}`, keys: { p256dh: `p-${n}`, auth: `a-${n}` } });

  /** A fake push service: records what was sent, and can refuse some addresses. */
  function fakeSender(refuse: Record<string, number> = {}) {
    const sent: { endpoint: string; payload: string }[] = [];
    const send: PushSender = async (s, payload) => {
      const code = Object.entries(refuse).find(([k]) => s.endpoint.endsWith(k))?.[1];
      if (code) throw Object.assign(new Error("refused"), { statusCode: code });
      sent.push({ endpoint: s.endpoint, payload });
    };
    return { send, sent };
  }

  beforeAll(async () => {
    ({ db, cleanup } = await createTestDb());
  });

  afterAll(async () => {
    await cleanup();
  });

  beforeEach(async () => {
    await db.ticket.deleteMany();
    await db.user.deleteMany();
    const mk = async (name: string, role: "QA" | "DEV" | "ADMIN") => {
      const u = await db.user.create({ data: { name, email: `${name.toLowerCase().replace(/\W/g, "")}@x.ph`, passwordHash: "x", role } });
      return { id: u.id, role } as Actor;
    };
    qa = await mk("Ana QA", "QA");
    dev = await mk("Ben Dev", "DEV");
    admin = await mk("Ada Admin", "ADMIN");
  });

  it("keeps one row per device, and a re-subscribe moves it to the new person", async () => {
    const s = pushStore(db);
    await s.subscribe(qa.id, sub("1"), "Chrome on Windows");
    await s.subscribe(qa.id, sub("1"), "Chrome on Windows");
    expect(await s.devices(qa.id)).toHaveLength(1);

    await s.subscribe(dev.id, sub("1"), "Chrome on Windows");
    expect(await s.has(qa.id, sub("1").endpoint)).toBe(false);
    expect(await s.has(dev.id, sub("1").endpoint)).toBe(true);

    await s.unsubscribe(qa.id, sub("1").endpoint); // not theirs: nothing happens
    expect(await s.has(dev.id, sub("1").endpoint)).toBe(true);
    await s.unsubscribe(dev.id, sub("1").endpoint);
    expect(await s.devices(dev.id)).toHaveLength(0);
  });

  it("saves work hours", async () => {
    const s = pushStore(db);
    await s.setWorkHours(dev.id, { offHoursPush: "NONE", workStartMin: 480, workEndMin: 1020, workDays: 62 });
    expect(await s.workHours(dev.id)).toEqual({ offHoursPush: "NONE", workStartMin: 480, workEndMin: 1020, workDays: 62 });
  });

  it("keeps each person's sound, from the list only", async () => {
    const s = pushStore(db);
    expect(await s.tone(dev.id)).toEqual({ tone: "tone-1" });
    expect(await s.setTone(dev.id, "custom")).toBe(false);
    expect(await s.setTone(dev.id, "tone-5")).toBe(true);
    expect(await s.tone(dev.id)).toEqual({ tone: "tone-5" });
    expect(await s.setTone(dev.id, "silent")).toBe(true);
  });

  const newTicket = (over: Partial<Parameters<ReturnType<typeof ticketStore>["create"]>[1]> = {}) =>
    ticketStore(db).create(qa, { type: "BUG", title: "Something broke", description: "x", areaId: null, severity: "S3", priority: "P3", foundIn: null, deviceType: null, assigneeId: dev.id, ...over });

  it("sends each person their own sound choice", async () => {
    const s = pushStore(db);
    await s.subscribe(dev.id, sub("dev"), "x");
    await s.subscribe(admin.id, sub("admin"), "x");
    await s.setTone(admin.id, "silent");
    const { id } = await newTicket();
    const commentId = await ticketStore(db).comment(qa, id, "Hello");

    const f = fakeSender();
    await notifyTicket(db, f.send, { ticketId: id, actorId: qa.id, event: { kind: "reply", commentId } }, { now: at });

    const tones = Object.fromEntries(f.sent.map((x) => [x.endpoint.split("/").pop(), JSON.parse(x.payload).tone]));
    expect(tones).toEqual({ dev: "tone-1", admin: "silent" });
  });

  it("tells each person's device their own unread count, for the app icon", async () => {
    const s = pushStore(db);
    await s.subscribe(dev.id, sub("dev"), "x");
    await s.subscribe(admin.id, sub("admin"), "x");
    const { id } = await newTicket();
    const commentId = await ticketStore(db).comment(qa, id, "Hello");
    const unread = notificationStore(db);
    await unread.markAllRead(admin);

    const f = fakeSender();
    await notifyTicket(db, f.send, { ticketId: id, actorId: qa.id, event: { kind: "reply", commentId } }, { now: at });

    const counts = Object.fromEntries(f.sent.map((x) => [x.endpoint.split("/").pop(), JSON.parse(x.payload).count]));
    expect(counts.dev).toBe((await unread.unread(dev, 1)).count);
    expect(counts.dev).toBeGreaterThan(0);
    expect(counts.admin).toBe(0);
  });

  it("still sends the notification when the unread count can't be read", async () => {
    await pushStore(db).subscribe(dev.id, sub("dev"), "x");
    const { id } = await newTicket();
    const commentId = await ticketStore(db).comment(qa, id, "Hello");
    const broken = new Proxy(db, { get: (t, k) => (k === "$queryRaw" ? () => Promise.reject(new Error("db")) : Reflect.get(t, k)) });

    const f = fakeSender();
    await notifyTicket(broken, f.send, { ticketId: id, actorId: qa.id, event: { kind: "reply", commentId } }, { now: at });

    const toDev = f.sent.find((x) => x.endpoint.endsWith("/dev"));
    expect(toDev).toBeDefined();
    expect(JSON.parse(toDev!.payload).count).toBeUndefined();
  });

  it("outside work hours sends with sound or not at all, as each person chose; an old Silent counts as not at all", async () => {
    const s = pushStore(db);
    await s.subscribe(dev.id, sub("dev"), "x");
    await s.subscribe(admin.id, sub("admin"), "x");
    // An account that still holds the old "Notify me silently" (before the D7 migration moved it).
    await db.user.update({ where: { id: dev.id }, data: { offHoursPush: "SILENT", workStartMin: 420, workEndMin: 1080, workDays: 62 } });
    await s.setWorkHours(admin.id, { offHoursPush: "SOUND", workStartMin: 420, workEndMin: 1080, workDays: 62 });
    const { id } = await newTicket();

    const f = fakeSender();
    await notifyTicket(db, f.send, { ticketId: id, actorId: qa.id, event: { kind: "status", to: "CLOSED" } }, { now: manila("2026-11-02T22:00:00") });

    expect(f.sent.map((x) => x.endpoint.split("/").pop())).toEqual(["admin"]);
  });

  it("notifies everyone who can see the ticket except the actor", async () => {
    const s = pushStore(db);
    await s.subscribe(qa.id, sub("qa"), "x");
    await s.subscribe(dev.id, sub("dev"), "x");
    await s.subscribe(admin.id, sub("admin"), "x");
    const { id, number } = await newTicket({ title: "Bill shows the wrong total" });

    const f = fakeSender();
    const r = await notifyTicket(db, f.send, { ticketId: id, actorId: qa.id, event: { kind: "filed" } }, { now: at });

    expect(r).toEqual({ sent: 2, removed: 0 });
    const byEnd = Object.fromEntries(f.sent.map((x) => [x.endpoint.split("/").pop(), JSON.parse(x.payload)]));
    expect(byEnd.dev).toMatchObject({ title: `#${number} · Bill shows the wrong total`, body: "Assigned to you by Ana QA\nModule: none" });
    expect(byEnd.admin.body).toBe("New ticket from Ana QA\nModule: none");
    expect(byEnd.qa).toBeUndefined();
    expect((await db.pushSubscription.findFirstOrThrow({ where: { userId: dev.id } })).lastSentAt).toEqual(at);
  });

  it("shows a reply's message with previews on (never a photo), and none of it with previews off", async () => {
    const s = pushStore(db);
    await s.subscribe(dev.id, sub("dev"), "x");
    await s.subscribe(admin.id, sub("admin"), "x");
    await db.user.update({ where: { id: admin.id }, data: { pushPreviews: false } });
    const { id } = await newTicket({ title: "Account 0123-45 shows the wrong total" });
    const commentId = await ticketStore(db).comment(qa, id, "Juan Dela Cruz again");
    for (const n of ["a", "b"]) {
      await db.attachment.create({ data: { ticketId: id, commentId, uploaderId: qa.id, kind: "IMAGE", storedName: `2026/10/${n}.png`, originalName: "x.png", mime: "image/png", size: 1 } });
    }

    const f = fakeSender();
    await notifyTicket(db, f.send, { ticketId: id, actorId: qa.id, event: { kind: "reply", commentId } }, { now: at });

    const byEnd = Object.fromEntries(f.sent.map((x) => [x.endpoint.split("/").pop(), JSON.parse(x.payload)]));
    expect(byEnd.dev.body).toBe("Ana QA: Juan Dela Cruz again 📷 2 photos\nModule: none");
    expect(byEnd.dev).not.toHaveProperty("image");
    expect(f.sent.map((x) => x.payload).join()).not.toMatch(/2026\/10\/[ab]\.png/);
    expect(JSON.stringify(byEnd.admin)).not.toMatch(/0123-45|Juan|wrong total/);
  });

  it("drops devices the push service no longer knows, and survives other failures", async () => {
    const s = pushStore(db);
    await s.subscribe(dev.id, sub("gone"), "x");
    await s.subscribe(admin.id, sub("down"), "x");
    const { id } = await newTicket();

    const f = fakeSender({ gone: 410, down: 500 });
    const r = await notifyTicket(db, f.send, { ticketId: id, actorId: qa.id, event: { kind: "edited" } }, { now: at });

    expect(r).toEqual({ sent: 0, removed: 1 });
    expect(await s.devices(dev.id)).toHaveLength(0);
    expect(await s.devices(admin.id)).toHaveLength(1);
  });

  it("sends nothing without a sender, for a missing ticket or a missing comment", async () => {
    expect(await notifyTicket(db, null, { ticketId: "x", actorId: qa.id, event: { kind: "edited" } })).toEqual({ sent: 0, removed: 0 });
    expect(await notifyTicket(db, fakeSender().send, { ticketId: "missing", actorId: qa.id, event: { kind: "edited" } })).toEqual({ sent: 0, removed: 0 });
    const { id } = await newTicket();
    expect(await notifyTicket(db, fakeSender().send, { ticketId: id, actorId: qa.id, event: { kind: "reply", commentId: "missing" } })).toEqual({ sent: 0, removed: 0 });
  });
});
