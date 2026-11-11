"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { SIGNUP_COOKIE } from "@/lib/auth/signup-cookie";
import { redirect } from "next/navigation";
import { auth, currentToken, getCurrentUser, requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { fromZodError, text, type FormState } from "@/lib/form";
import { deviceLabel } from "@/lib/push/device";
import { TEST_MESSAGE } from "@/lib/push/message";
import { sendTo } from "@/lib/push/send";
import { pushStore } from "@/lib/push/store";
import { webPushSender } from "@/lib/push/web-push";
import { avatarStore } from "@/lib/users/avatar";
import { removeObjects } from "@/lib/uploads/storage";
import { pushSubscriptionInput, workHoursInput } from "@/lib/schemas/push";
import { passwordChangeInput } from "@/lib/schemas/user";

const push = pushStore(db);

export async function changePassword(_prev: FormState, fd: FormData): Promise<FormState> {
  // getCurrentUser, not requireUser: people with a temporary password must be able to reach this action.
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const parsed = passwordChangeInput.safeParse({ current: text(fd, "current"), next: text(fd, "next"), confirm: text(fd, "confirm") });
  if (!parsed.success) return fromZodError(parsed.error);
  if (!(await auth.verifyUserPassword(user.id, parsed.data.current))) {
    return { ok: false, message: "Please fix the highlighted fields.", fieldErrors: { current: ["That isn't your current password"] } };
  }

  await auth.setPassword(user.id, parsed.data.next, false);
  await auth.deleteUserSessions(user.id, await currentToken());
  // Their own password ends the sign-up request (setPassword clears it), so this browser forgets it too.
  (await cookies()).delete(SIGNUP_COOKIE);
  redirect("/");
}

// ── Profile photo. Only ever the signed-in person's own: the user id comes from the session. ──

const avatars = avatarStore(db);

const dropFile = (file: string) => removeObjects([file]).catch((e) => console.error("[account] couldn't delete an old profile photo:", e));

/** Makes an upload they just finished (and the server checked) their photo. */
export async function saveAvatar(uploadId: string): Promise<FormState> {
  const me = await requireUser();
  const r = typeof uploadId === "string" ? await avatars.set(me.id, uploadId) : false;
  if (!r) return { ok: false, message: "That upload has expired. Add the photo again." };
  if (r.old) await dropFile(r.old);
  // The whole layout: the account menu shows it too.
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function removeAvatar(): Promise<void> {
  const me = await requireUser();
  const file = await avatars.clear(me.id);
  if (file) await dropFile(file);
  revalidatePath("/", "layout");
}

// ── Device notifications (Web Push). Each person manages only their own devices: the user id comes from the session. ──

/** Whether the server still has this browser's subscription for the signed-in person. */
export async function pushStatus(endpoint: string): Promise<boolean> {
  const me = await requireUser();
  return push.has(me.id, endpoint);
}

/** "Turn on": saves the subscription the browser just made. */
export async function savePushSubscription(sub: unknown): Promise<FormState> {
  const me = await requireUser();
  const parsed = pushSubscriptionInput.safeParse(sub);
  if (!parsed.success) return { ok: false, message: "This browser gave an address QA Hub can't use. Try Chrome, Edge, Firefox or Safari." };
  await push.subscribe(me.id, parsed.data, deviceLabel((await headers()).get("user-agent") ?? ""));
  return { ok: true };
}

/** "Turn off" on this device. */
export async function removePushSubscription(endpoint: string): Promise<void> {
  const me = await requireUser();
  await push.unsubscribe(me.id, endpoint);
}

/** "Send test": one notification to this device only. */
export async function sendTestPush(endpoint: string): Promise<FormState> {
  const me = await requireUser();
  const send = webPushSender();
  if (!send) return { ok: false, message: "Device notifications aren't set up on the server yet." };
  const sub = await push.device(me.id, endpoint);
  if (!sub) return { ok: false, message: "This device is off. Turn it on first." };
  const r = await sendTo(db, send, [sub], { ...TEST_MESSAGE, tone: (await push.tone(me.id)).tone });
  if (r.removed) return { ok: false, message: "The browser no longer accepts notifications for this device. Turn it on again." };
  return r.sent ? { ok: true, message: "Sent. It should appear in a few seconds. (Tests ignore work hours.)" } : { ok: false, message: "Couldn't reach the push service. Check the internet connection and try again." };
}

export async function saveWorkHours(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireUser();
  const parsed = workHoursInput.safeParse({
    offHoursPush: text(fd, "offHoursPush"),
    workStartMin: text(fd, "workStart"),
    workEndMin: text(fd, "workEnd"),
    days: fd.getAll("days").map(Number),
  });
  if (!parsed.success) return fromZodError(parsed.error);
  await push.setWorkHours(me.id, parsed.data);
  revalidatePath("/account");
  return { ok: true, message: "Saved." };
}

// ── Notification sound ──

/** Their sound choice, for the sign-in prompt. */
export async function myTone(): Promise<{ tone: string }> {
  const me = await requireUser();
  return push.tone(me.id);
}

export async function saveTone(tone: string): Promise<FormState> {
  const me = await requireUser();
  if (!(await push.setTone(me.id, tone))) return { ok: false, message: "Pick one of the sounds in the list." };
  revalidatePath("/account");
  return { ok: true, message: "Saved." };
}

/** "Show message previews": ticket title and message in notifications, or only the short form. */
export async function savePreviews(on: boolean): Promise<void> {
  const me = await requireUser();
  await push.setPreviews(me.id, on === true);
  revalidatePath("/account");
}

