"use server";

import { revalidatePath } from "next/cache";
import { generateTempPassword } from "@/lib/auth/password";
import { can } from "@/lib/auth/permissions";
import { auth, requireAction } from "@/lib/auth/session";
import { TempAccessError, tempAccessStore } from "@/lib/auth/temp-access";
import { db } from "@/lib/db";
import { pushStore } from "@/lib/push/store";
import { fromDbError, fromZodError, text, type FormState } from "@/lib/form";
import { userInput, userUpdateInput } from "@/lib/schemas/user";
import { removeObjects } from "@/lib/uploads/storage";
import { UserDeleteError, userDeletion, type DeletionPreview } from "@/lib/users/delete";
import { userAdminStore } from "@/lib/users/store";

const deletion = userDeletion(db);
const accounts = userAdminStore(db);

/** The temporary password is returned once, shown to the admin, and never stored in plain text. */
export type UserFormState = FormState & { tempPassword?: string; email?: string };

function duplicateEmail(e: unknown): UserFormState | null {
  return (e as { code?: unknown } | null)?.code === "P2002"
    ? { ok: false, message: "Please fix the highlighted fields.", fieldErrors: { email: ["Another account already uses this email"] } }
    : null;
}

export async function createUser(_prev: UserFormState, fd: FormData): Promise<UserFormState> {
  await requireAction("users.manage");
  const parsed = userInput.safeParse({ name: text(fd, "name"), email: text(fd, "email"), role: text(fd, "role"), designer: fd.get("designer") === "on", teamLead: fd.get("teamLead") === "on" });
  if (!parsed.success) return fromZodError(parsed.error);

  const tempPassword = generateTempPassword();
  try {
    await auth.createUser({ ...parsed.data, password: tempPassword });
  } catch (e) {
    return duplicateEmail(e) ?? fromDbError(e);
  }
  revalidatePath("/admin/users");
  revalidatePath("/team");
  return { ok: true, tempPassword, email: parsed.data.email };
}

export async function updateUser(_prev: UserFormState, fd: FormData): Promise<UserFormState> {
  const me = await requireAction("users.manage");
  const id = text(fd, "id");
  const parsed = userUpdateInput.safeParse({
    name: text(fd, "name"),
    email: text(fd, "email"),
    role: text(fd, "role"),
    designer: fd.get("designer") === "on",
    teamLead: fd.get("teamLead") === "on",
    active: fd.get("active") === "on",
  });
  if (!parsed.success) return fromZodError(parsed.error);

  if (id === me.id && !parsed.data.active) return { ok: false, message: "You can't turn off your own account." };
  if (await auth.wouldRemoveLastAdmin(id, parsed.data)) return { ok: false, message: "Keep at least one active admin, or nobody can manage users." };

  try {
    const problem = await accounts.update(id, parsed.data);
    if (problem) return { ok: false, message: problem };
  } catch (e) {
    return duplicateEmail(e) ?? fromDbError(e);
  }
  if (!parsed.data.active) await auth.deleteUserSessions(id);
  revalidatePath("/admin/users");
  revalidatePath("/team");
  return { ok: true };
}

/** What deleting this account would remove, for the confirmation dialog. */
export async function deletionPreview(id: string): Promise<DeletionPreview | null> {
  await requireAction("users.manage");
  return deletion.preview(id);
}

/** Deletes the account and everything it made (lib/users/delete.ts). The admin types the account's email to confirm. */
export async function deleteUser(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireAction("users.manage");
  let files: string[];
  try {
    ({ files } = await deletion.deleteEverything(me, text(fd, "id"), text(fd, "confirm")));
  } catch (e) {
    if (e instanceof UserDeleteError) return { ok: false, message: e.message };
    throw e;
  }
  // The rows are gone, so a file left behind would only waste space; don't fail the delete over it.
  if (files.length) await removeObjects(files).catch((e) => console.error("[users] couldn't remove a deleted user's files:", e instanceof Error ? e.message : e));
  revalidatePath("/admin/users");
  revalidatePath("/team");
  revalidatePath("/tickets");
  return { ok: true };
}

/**
 * Approves a sign-up. A request its browser remembers needs nothing more: that browser gets the temporary password on
 * the sign-in page. One made before that gets a one-time temporary password, returned for the admin to hand over.
 */
export async function approveSignUp(id: string): Promise<UserFormState> {
  await requireAction("users.requests");
  const user = await accounts.contact(id);
  const result = user ? await auth.approveSignUp(id, () => generateTempPassword()) : null;
  if (!user || !result) return { ok: false, message: "This request was already handled. Refresh the page." };
  // No revalidatePath here: refreshing now would remove the request's row, and the dialog with it. The dialog refreshes
  // the page when it closes (straight away when there's no temporary password to show).
  return { ok: true, tempPassword: result.tempPassword ?? undefined, email: user.email };
}

export async function rejectSignUp(id: string): Promise<FormState> {
  await requireAction("users.requests");
  if (!(await auth.rejectSignUp(id))) return { ok: false, message: "This request was already handled. Refresh the page." };
  revalidatePath("/admin/users");
  revalidatePath("/");
  return { ok: true };
}

/**
 * Admins reset anyone's password. Someone lent "Sign-ups & password requests" resets only people who asked for it on
 * the sign-in page, and never an admin's.
 */
export async function resetPassword(id: string): Promise<UserFormState> {
  const me = await requireAction("users.requests");
  if (id === me.id) return { ok: false, message: "Change your own password in My account." };
  const user = await accounts.contact(id);
  if (!user) return { ok: false, message: "The user no longer exists. Refresh the page." };
  if (!can(me, "users.manage") && (!user.resetRequestedAt || user.role === "ADMIN")) {
    return { ok: false, message: "Only an admin can reset this password." };
  }

  const tempPassword = generateTempPassword();
  await auth.setPassword(id, tempPassword, true);
  await auth.deleteUserSessions(id);
  await auth.clearResetRequest(id);
  // No revalidatePath, like approveSignUp: the dialog showing the password refreshes the page when it closes.
  return { ok: true, tempPassword, email: user.email };
}

/**
 * For a lost phone: ends every session of this person and stops device notifications, which carry ticket text and would
 * otherwise keep arriving on it. Their password stays; they sign in again and turn notifications back on.
 */
export async function signOutAllDevices(id: string): Promise<FormState> {
  const me = await requireAction("users.manage");
  if (id === me.id) return { ok: false, message: "Use Sign out on your own devices." };
  await auth.deleteUserSessions(id);
  await pushStore(db).forgetDevices(id);
  return { ok: true };
}

/** Removes a forgot-password request without resetting, e.g. when the person remembered their password. */
export async function dismissResetRequest(id: string): Promise<FormState> {
  await requireAction("users.requests");
  if (!(await auth.clearResetRequest(id))) return { ok: false, message: "This request was already handled. Refresh the page." };
  revalidatePath("/admin/users");
  revalidatePath("/");
  return { ok: true };
}

const tempAccess = tempAccessStore(db);

/** Admin → Users → Temporary access: lends the ticked admin features for 1–72 hours. Real admins only. */
export async function giveTempAccess(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireAction("users.manage");
  const hours = Number(text(fd, "hours"));
  const actions = fd.getAll("feature").filter((v): v is string => typeof v === "string");
  try {
    await tempAccess.give(me.id, { userId: text(fd, "userId"), actions, hours });
  } catch (e) {
    if (e instanceof TempAccessError) return { ok: false, message: e.message };
    throw e;
  }
  revalidatePath("/admin/users");
  return { ok: true };
}

/** Ends someone's temporary access now. */
export async function endTempAccess(userId: string): Promise<FormState> {
  await requireAction("users.manage");
  if (!(await tempAccess.end(userId))) return { ok: false, message: "It had already ended. Refresh the page." };
  revalidatePath("/admin/users");
  return { ok: true };
}