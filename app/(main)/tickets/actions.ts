"use server";

import { revalidatePath } from "next/cache";
import { redirect, RedirectType } from "next/navigation";
import { after } from "next/server";
import { requireAction, requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { fromZodError, text, type FormState } from "@/lib/form";
import { notifyTicket, type TicketTrigger } from "@/lib/push/send";
import { webPushSender } from "@/lib/push/web-push";
import { filingMark } from "@/lib/tickets/draft";
import { categoryInput, commentInput, ticketCreate, ticketEdit, transitionInput } from "@/lib/schemas/ticket";
import { notificationStore } from "@/lib/tickets/notifications";
import { TicketError, ticketStore } from "@/lib/tickets/store";
import { removeObjects } from "@/lib/uploads/storage";

const tickets = ticketStore(db);
const sender = webPushSender();

/** Device notifications are sent after the response, so a slow push service never holds up the person's change. */
const push = (ticketId: string, actorId: string, event: TicketTrigger) =>
  after(async () => {
    const r = await notifyTicket(db, sender, { ticketId, actorId, event });
    // Counts only, so the logs show whether a device was reached without any ticket text or address.
    console.info(`[push] ${event.kind}: sent to ${r.sent} device(s), removed ${r.removed} dead`);
  });

/**
 * Ids of images and videos the browser already uploaded to Storage (see app/(main)/uploads). The store claims them,
 * only the sender's own and finished ones. A refused post leaves them waiting, so the person can fix it and resend.
 */
const uploadIds = (fd: FormData): string[] => fd.getAll("uploadIds").filter((v): v is string => typeof v === "string" && v.length > 0);

/** Runs a store call and turns a refusal into the form's message. */
async function run(fn: () => Promise<unknown>): Promise<FormState> {
  try {
    await fn();
    return { ok: true };
  } catch (e) {
    if (e instanceof TicketError) return { ok: false, message: e.message };
    throw e;
  }
}

function fields(fd: FormData) {
  return {
    type: text(fd, "type"),
    title: text(fd, "title"),
    description: text(fd, "description"),
    areaId: text(fd, "areaId"),
    severity: text(fd, "severity"),
    priority: text(fd, "priority") || undefined,
    foundIn: text(fd, "foundIn"),
    deviceType: text(fd, "deviceType"),
  };
}

const refresh = (number?: number) => {
  revalidatePath("/tickets");
  revalidatePath("/inbox");
  revalidatePath("/");
  if (number) revalidatePath(`/tickets/${number}`);
};

export async function createTicket(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireAction("tickets.create");
  const parsed = ticketCreate.safeParse({ ...fields(fd), assigneeId: text(fd, "assigneeId"), category: text(fd, "category"), uploadIds: uploadIds(fd) });
  if (!parsed.success) return fromZodError(parsed.error);

  let created = { id: "", number: 0 };
  const files = parsed.data.uploadIds;
  const r = await run(async () => {
    created = await tickets.create(me, parsed.data, files);
  });
  if (!r.ok) return r;
  const { id, number } = created;
  push(id, me.id, { kind: "filed" });
  refresh();
  // ?filing: this really is that browser's ticket, filed, so it can delete its draft (draft-cleanup.tsx), and Back goes to
  // the list. Replaced, so the finished form isn't left in the history.
  const mark = filingMark(fd.get("filing"));
  redirect(`/tickets/${number}${mark ? `?filing=${mark}` : ""}`, RedirectType.replace);
}

export async function editTicket(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireAction("tickets.create");
  const parsed = ticketEdit.safeParse(fields(fd));
  if (!parsed.success) return fromZodError(parsed.error);
  const id = text(fd, "id");
  const r = await run(() => tickets.update(me, id, parsed.data));
  if (r.ok) {
    push(id, me.id, { kind: "edited" });
    refresh(Number(text(fd, "number")));
  }
  return r;
}

/** Details' Category select. The store checks that this person may change it. */
export async function categorizeTicket(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireAction("tickets.categorize");
  const parsed = categoryInput.safeParse(text(fd, "category"));
  if (!parsed.success) return { ok: false, message: "Choose a category." };
  const r = await run(() => tickets.categorize(me, text(fd, "id"), parsed.data));
  if (r.ok) refresh(Number(text(fd, "number")));
  return r;
}

export async function assignTicket(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireAction("tickets.assign");
  const id = text(fd, "id");
  const note = text(fd, "note").trim().slice(0, 500) || null;
  const r = await run(() => tickets.assign(me, id, text(fd, "assigneeId") || null, note));
  if (r.ok) {
    push(id, me.id, { kind: "assigned", note });
    refresh(Number(text(fd, "number")));
  }
  return r;
}

/** Won't fix → "Another developer should take it": back to QA unassigned, with a recommendation. */
export async function handBackTicket(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireAction("tickets.resolve");
  const id = text(fd, "id");
  const note = text(fd, "note").trim().slice(0, 5000);
  if (!note) return { ok: false, message: "Add a note explaining why.", fieldErrors: { note: ["Add a note explaining why."] } };
  let recommended: string | null = null;
  const r = await run(async () => {
    ({ recommended } = await tickets.handBack(me, id, { recommendId: text(fd, "recommendId") || null, note }));
  });
  if (r.ok) {
    push(id, me.id, { kind: "handedBack", recommended, note });
    refresh(Number(text(fd, "number")));
  }
  return r;
}

export async function moveTicket(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireUser();
  const parsed = transitionInput.safeParse({ to: text(fd, "to"), note: text(fd, "note"), duplicateOf: text(fd, "duplicateOf") });
  if (!parsed.success) return fromZodError(parsed.error);
  const id = text(fd, "id");
  const r = await run(() => tickets.transition(me, id, parsed.data));
  if (r.ok) {
    push(id, me.id, { kind: "status", to: parsed.data.to, note: parsed.data.note });
    refresh(Number(text(fd, "number")));
  }
  return r;
}

/** Permanent. The person must type the ticket's title (checked here too, not just in the dialog). */
export async function deleteTicket(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireAction("tickets.delete");
  let deleted: { number: number; files: { storedName: string }[] };
  try {
    deleted = await tickets.delete(me, text(fd, "id"), text(fd, "confirm"));
  } catch (e) {
    if (e instanceof TicketError) return { ok: false, message: e.message };
    throw e;
  }
  // The row is gone, so a file left behind would only waste space; don't fail the delete over it.
  if (deleted.files.length) await removeObjects(deleted.files.map((f) => f.storedName)).catch((e) => console.error(`[tickets] couldn't remove files of #${deleted.number}:`, e));
  refresh(deleted.number);
  redirect("/tickets?deleted=" + deleted.number);
}

export async function addComment(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireAction("tickets.comment");
  const parsed = commentInput.safeParse({ body: text(fd, "body") });
  if (!parsed.success) return fromZodError(parsed.error);

  const id = text(fd, "id");
  let commentId = "";
  const r = await run(async () => {
    commentId = await tickets.comment(me, id, parsed.data.body, uploadIds(fd));
  });
  if (r.ok) {
    push(id, me.id, { kind: "reply", commentId });
    refresh(Number(text(fd, "number")));
  }
  return r;
}

const notifications = notificationStore(db);

/** Opening a ticket marks it read for the person (the ticket page calls this once it has shown the latest activity). */
export async function markTicketRead(ticketId: string): Promise<void> {
  const me = await requireUser();
  await notifications.markRead(me, ticketId);
}

/** "Mark all as read" in the bell. */
export async function markAllTicketsRead(): Promise<void> {
  const me = await requireUser();
  await notifications.markAllRead(me);
  revalidatePath("/tickets");
  revalidatePath("/");
}
