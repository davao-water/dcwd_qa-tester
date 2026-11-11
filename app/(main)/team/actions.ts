"use server";

import { revalidatePath } from "next/cache";
import { addToAreas } from "@/lib/areas/assign";
import { areaStore } from "@/lib/areas/store";
import { requireAction } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { fromDbError, fromZodError, text, type FormState } from "@/lib/form";
import { areaAssignInput, areaInput, areaMembersInput } from "@/lib/schemas/area";

const areas = areaStore(db);

function duplicateCode(e: unknown): FormState | null {
  return (e as { code?: unknown } | null)?.code === "P2002"
    ? { ok: false, message: "Please fix the highlighted fields.", fieldErrors: { code: ["Another area already uses this code"] } }
    : null;
}

export async function saveArea(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireAction("areas.manage");
  const parsed = areaInput.safeParse({
    name: text(fd, "name"),
    code: text(fd, "code"),
    parentId: text(fd, "parentId"),
    sortOrder: text(fd, "sortOrder") || undefined,
    active: fd.get("active") === "on",
  });
  if (!parsed.success) return fromZodError(parsed.error);

  try {
    const problem = await areas.save(text(fd, "id") || undefined, parsed.data);
    if (problem) return { ok: false, message: problem };
  } catch (e) {
    return duplicateCode(e) ?? fromDbError(e);
  }
  revalidatePath("/team");
  revalidatePath("/admin/users");
  return { ok: true };
}

export async function deleteArea(id: string): Promise<FormState> {
  await requireAction("areas.manage");
  try {
    const problem = await areas.remove(id);
    if (problem) return { ok: false, message: problem };
  } catch (e) {
    return fromDbError(e);
  }
  revalidatePath("/team");
  revalidatePath("/admin/users");
  return { ok: true };
}

export async function saveAreaMembers(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireAction("areas.manage");
  const parsed = areaMembersInput.safeParse({
    areaId: text(fd, "areaId"),
    members: fd.getAll("member").filter((v): v is string => typeof v === "string"),
    lead: text(fd, "lead"),
    designers: fd.getAll("designer").filter((v): v is string => typeof v === "string"),
  });
  if (!parsed.success) return fromZodError(parsed.error);

  try {
    const problem = await areas.setMembers(parsed.data);
    if (problem) return { ok: false, message: problem };
  } catch (e) {
    return fromDbError(e);
  }
  revalidatePath("/team");
  revalidatePath("/admin/users");
  return { ok: true };
}

/** Assign to modules: adds the ticked people to every ticked module and sub-module, keeping who is already there. */
export async function assignToModules(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireAction("areas.manage");
  const list = (name: string) => fd.getAll(name).filter((v): v is string => typeof v === "string");
  const parsed = areaAssignInput.safeParse({ areaIds: list("area"), members: list("member"), lead: text(fd, "lead"), designers: list("designer") });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Please check the form." };

  try {
    const problem = await addToAreas(db, parsed.data);
    if (problem) return { ok: false, message: problem };
  } catch (e) {
    return fromDbError(e);
  }
  revalidatePath("/team");
  revalidatePath("/admin/users");
  return { ok: true };
}
