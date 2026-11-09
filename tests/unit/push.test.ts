import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { deviceLabel } from "@/lib/push/device";
import { base64UrlToBytes } from "@/lib/push/key";
import { clip, pushMessage } from "@/lib/push/message";
import { delivery, inWorkHours, pickRecipients, type WorkHours } from "@/lib/push/recipients";
import { notifyTicket, type PushSender } from "@/lib/push/send";
import { pushStore } from "@/lib/push/store";
import { DEFAULT_TONE, effectiveTone, isTone, toneSrc } from "@/lib/push/tones";
import { webPushSender } from "@/lib/push/web-push";
import { isPushEndpoint, pushSubscriptionInput, workHoursInput } from "@/lib/schemas/push";
import { notificationStore } from "@/lib/tickets/notifications";
import { ticketStore } from "@/lib/tickets/store";
import type { Actor } from "@/lib/tickets/workflow";
import { createTestDb } from "./helpers/test-db";

const always: WorkHours = { offHoursPush: "SOUND", workStartMin: 420, workEndMin: 1080, workDays: 62 };
const office: WorkHours = { ...always, offHoursPush: "NONE" };
const quiet: WorkHours = { ...always, offHoursPush: "SILENT" };
/** A UTC instant from a Manila wall-clock time (UTC+8). */
const manila = (iso: string) => new Date(new Date(iso + "Z").getTime() - 8 * 3600_000);

describe("pushMessage", () => {
  const t = { number: 12, title: "Bill shows the wrong total", type: "BUG" as const, areaName: "Billing", actorName: "Ana", forAssignee: false, previews: true };
  const reply = (text: string, photos = 0, video = false) => ({ kind: "reply" as const, text, photos, video });

  it("leads with the message: ticket title, who wrote what, and the module", () => {
    expect(pushMessage(reply("Can you check the total again?"), t)).toEqual({
      title: "#12 · Bill shows the wrong total",
      body: "Ana: Can you check the total again?\nModule: Billing",
      url: "/tickets/12?tab=conversation",
      tag: "ticket-12",
      stack: { line: "Ana: Can you check the total again?", detail: "Module: Billing" },
    });
  });

  it("cuts long titles and messages to one short line", () => {
    const m = pushMessage(reply("word ".repeat(100)), { ...t, title: "x".repeat(200) });
    expect(m.title.length).toBeLessThanOrEqual("#12 · ".length + 80);
    expect(m.title.endsWith("…")).toBe(true);
    expect(m.body.split("\n")[0].length).toBeLessThanOrEqual(140);
    expect(clip("a\n\n  b", 10)).toBe("a b");
  });

  it("says what's attached", () => {
    expect(pushMessage(reply("", 1), t).body.split("\n")[0]).toBe("Ana: 📷 Photo");
    expect(pushMessage(reply("See these", 3, true), t).body.split("\n")[0]).toBe("Ana: See these 📷 3 photos 🎥 Video");
  });

  it("tells QA a ticket was handed back, with the recommendation, and the reason only with previews on", () => {
    const e = { kind: "handedBack" as const, recommended: "Cy", note: "It's in the payroll code" };
    expect(pushMessage(e, t).body.split("\n")[0]).toBe("Ana handed it back to reassign. Recommends Cy. It's in the payroll code");
    expect(pushMessage(e, { ...t, previews: false }).body.split("\n")[0]).toBe("Ana handed it back to reassign. Recommends Cy.");
    expect(pushMessage({ kind: "handedBack", recommended: null }, t).body.split("\n")[0]).toBe("Ana handed it back to reassign.");
  });

  it("with previews off shows no ticket text at all", () => {
    const m = pushMessage(reply("Account 0123-45 of Juan Dela Cruz"), { ...t, previews: false });
    expect(m.title).toBe("#12 · Bug");
    expect(m.body).toBe("New reply from Ana\nModule: Billing");
    expect(JSON.stringify(m)).not.toMatch(/0123-45|Juan|wrong total/);
    const note = pushMessage({ kind: "status", to: "NEED_INFO", note: "Juan's account" }, { ...t, previews: false });
    expect(note.body).not.toMatch(/Juan/);
  });

  it("describes the other events, the status note only with previews", () => {
    const line = (e: Parameters<typeof pushMessage>[0], over: Partial<typeof t> = {}) => pushMessage(e, { ...t, ...over }).body.split("\n")[0];
    expect(line({ kind: "filed" }, { forAssignee: true })).toBe("Assigned to you by Ana");
    expect(line({ kind: "filed" })).toBe("New ticket from Ana");
    expect(line({ kind: "assigned" }, { forAssignee: true })).toBe("Assigned to you by Ana");
    expect(line({ kind: "assigned" })).toBe("Assignee changed by Ana");
    expect(line({ kind: "assigned", note: "Ben is on leave" }, { forAssignee: true })).toBe("Assigned to you by Ana: Ben is on leave");
    expect(line({ kind: "assigned", note: "Juan's account" }, { forAssignee: true, previews: false })).toBe("Assigned to you by Ana");
    expect(line({ kind: "edited" })).toBe("Edited by Ana");
    expect(line({ kind: "status", to: "NEED_INFO", note: "Which account?" })).toMatch(/^Ana marked it .+: Which account\?$/);
    expect(pushMessage({ kind: "edited" }, { ...t, areaName: null }).body).toBe("Edited by Ana\nModule: none");
    expect(pushMessage({ kind: "edited" }, t).stack).toBeUndefined(); // only replies stack
  });

  it("gives each status change its own notification, while the rest share the ticket's", () => {
    const at = (iso: string) => ({ ...t, at: new Date(iso) });
    const fixed = pushMessage({ kind: "status", to: "FIXED" }, at("2026-11-01T09:00:00Z")).tag;
    const closed = pushMessage({ kind: "status", to: "CLOSED" }, at("2026-11-01T09:05:00Z")).tag;
    expect(fixed).not.toBe(closed);
    expect(fixed.startsWith("ticket-12-")).toBe(true);
    expect(fixed.length).toBeLessThanOrEqual(32); // also the push topic, which allows 32 characters
    expect(pushMessage({ kind: "edited" }, at("2026-11-01T09:00:00Z")).tag).toBe("ticket-12");
  });
});

describe("inWorkHours and delivery", () => {
  it("rings at any hour for someone who chose sound", () => {
    expect(delivery(always, manila("2026-11-01T23:00:00"))).toBe("sound");
  });

  it("outside work hours stays off when asked, and an old Silent choice counts as off (D7)", () => {
    const night = manila("2026-11-02T22:00:00"); // Monday 22:00
    const sunday = manila("2026-11-01T10:00:00");
    expect(delivery(office, night)).toBeNull();
    expect(delivery(quiet, night)).toBeNull();
    expect(delivery(quiet, sunday)).toBeNull();
    expect(delivery(quiet, manila("2026-11-02T10:00:00"))).toBe("sound");
  });

  it("uses Manila time, weekdays and the end as exclusive", () => {
    expect(inWorkHours(office, manila("2026-11-02T07:00:00"))).toBe(true); // Monday 07:00
    expect(inWorkHours(office, manila("2026-11-02T06:59:00"))).toBe(false);
    expect(inWorkHours(office, manila("2026-11-02T18:00:00"))).toBe(false);
    expect(inWorkHours(office, manila("2026-11-01T10:00:00"))).toBe(false); // Sunday
  });

  it("handles a shift past midnight", () => {
    const night = { ...office, workStartMin: 22 * 60, workEndMin: 6 * 60, workDays: 127 };
    expect(inWorkHours(night, manila("2026-11-02T23:30:00"))).toBe(true);
    expect(inWorkHours(night, manila("2026-11-02T05:00:00"))).toBe(true);
    expect(inWorkHours(night, manila("2026-11-02T12:00:00"))).toBe(false);
  });
});

describe("pickRecipients", () => {
  const ticket = { status: "NEW" as const, reporterId: "qa", assigneeId: "dev" };
  const c = (id: string, role: Actor["role"], w: WorkHours = always) => ({ id, role, ...w });

  it("skips the actor and people who can't see the ticket", () => {
    const got = pickRecipients(ticket, "qa", [c("qa", "QA"), c("qa2", "QA"), c("dev", "DEV"), c("dev2", "DEV"), c("admin", "ADMIN")], manila("2026-11-02T10:00:00"));
    expect(got.map((r) => r.id)).toEqual(["dev", "admin"]);
  });

  it("skips people outside their work hours", () => {
    const got = pickRecipients(ticket, "qa", [c("dev", "DEV", office), c("admin", "ADMIN")], manila("2026-11-02T20:00:00"));
    expect(got.map((r) => r.id)).toEqual(["admin"]);
  });

  it("leaves out someone off work who chose no notifications, or still holds the old Silent choice", () => {
    const got = pickRecipients(ticket, "qa", [c("dev", "DEV", quiet), c("admin", "ADMIN")], manila("2026-11-02T20:00:00"));
    expect(got.map((r) => [r.id, r.delivery])).toEqual([["admin", "sound"]]);
  });
});

describe("deviceLabel", () => {
  it("names the browser and system", () => {
    expect(deviceLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36 Edg/141.0")).toBe("Edge on Windows");
    expect(deviceLabel("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36")).toBe("Chrome on Android");
    expect(deviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1")).toBe("Safari on iPhone/iPad");
    expect(deviceLabel("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15")).toBe("Safari on Mac");
    expect(deviceLabel("")).toBe("Browser on unknown device");
  });
});

describe("push schemas", () => {
  it("accepts only the browsers' push services over https", () => {
    expect(isPushEndpoint("https://fcm.googleapis.com/fcm/send/abc")).toBe(true);
    expect(isPushEndpoint("https://web.push.apple.com/abc")).toBe(true);
    expect(isPushEndpoint("https://wns2-sg2p.notify.windows.com/w/?token=abc")).toBe(true);
    expect(isPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/abc")).toBe(true);
    expect(isPushEndpoint("http://fcm.googleapis.com/fcm/send/abc")).toBe(false);
    expect(isPushEndpoint("https://evil.example/push.apple.com")).toBe(false);
    expect(isPushEndpoint("https://push.apple.com.evil.example/x")).toBe(false);
    expect(isPushEndpoint("not a url")).toBe(false);
  });

  it("needs both keys", () => {
    expect(pushSubscriptionInput.safeParse({ endpoint: "https://fcm.googleapis.com/fcm/send/a", keys: { p256dh: "p", auth: "a" } }).success).toBe(true);
    expect(pushSubscriptionInput.safeParse({ endpoint: "https://fcm.googleapis.com/fcm/send/a", keys: { p256dh: "p" } }).success).toBe(false);
  });

  it("turns times and days into minutes and a bitmask", () => {
    const r = workHoursInput.safeParse({ offHoursPush: "NONE", workStartMin: "07:30", workEndMin: "17:00", days: [1, 2, 3, 4, 5] });
    expect(r.success && r.data).toEqual({ offHoursPush: "NONE", workStartMin: 450, workEndMin: 1020, workDays: 62 });
    expect(workHoursInput.safeParse({ offHoursPush: "NONE", workStartMin: "08:00", workEndMin: "08:00", days: [1] }).success).toBe(false);
    expect(workHoursInput.safeParse({ offHoursPush: "NONE", workStartMin: "08:00", workEndMin: "17:00", days: [] }).success).toBe(false);
    expect(workHoursInput.safeParse({ offHoursPush: "NONE", workStartMin: "25:00", workEndMin: "17:00", days: [1] }).success).toBe(false);
    // "Notify me silently" is no longer a choice (D7).
    expect(workHoursInput.safeParse({ offHoursPush: "SILENT", workStartMin: "07:30", workEndMin: "17:00", days: [1] }).success).toBe(false);
  });
});

describe("base64UrlToBytes", () => {
  it("decodes URL-safe base64 without padding", () => {
    expect(Array.from(base64UrlToBytes("-_8"))).toEqual([0xfb, 0xff]);
    expect(Array.from(base64UrlToBytes("AQID"))).toEqual([1, 2, 3]);
  });
});

describe("webPushSender", () => {
  it("is off until all three VAPID settings are there", () => {
    expect(webPushSender({ NEXT_PUBLIC_VAPID_PUBLIC_KEY: "a", VAPID_PRIVATE_KEY: "b" })).toBeNull();
  });
});

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

describe("tones", () => {
  it("knows the valid choices", () => {
    expect(isTone("tone-1")).toBe(true);
    expect(isTone("tone-11")).toBe(true);
    expect(isTone("tone-12")).toBe(false);
    expect(isTone("silent")).toBe(true);
    expect(isTone("custom")).toBe(false);
  });

  it("plays presets from /sounds", () => {
    expect(toneSrc("tone-3")).toBe("/sounds/tone-3.mp3");
    expect(toneSrc("custom")).toBeNull();
    expect(toneSrc("silent")).toBeNull();
    expect(toneSrc("../../etc/passwd")).toBeNull();
  });

  it("falls back to the default for anything that isn't in the list", () => {
    expect(effectiveTone({ notifyTone: "custom" })).toBe(DEFAULT_TONE);
    expect(effectiveTone({ notifyTone: "tone-4" })).toBe("tone-4");
  });
});
