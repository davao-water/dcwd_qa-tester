"use server";

import { revalidatePath } from "next/cache";
import { nextSortOrder, placementError } from "@/lib/areas/tree";
import { requireAction } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { fromDbError, fromZodError, text, type FormState } from "@/lib/form";
import { areaInput, areaMembersInput } from "@/lib/schemas/area";

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

  const id = text(fd, "id") || undefined;
  const areas = await db.erpArea.findMany({ select: { id: true, parentId: true, name: true, sortOrder: true } });
  const problem = placementError(areas, { id, parentId: parsed.data.parentId, name: parsed.data.name });
  if (problem) return { ok: false, message: problem };

  // No sort order in the form (sub-modules): a new one goes after its siblings, an edited one keeps its place.
  const data = { ...parsed.data };
  if (data.sortOrder === undefined && !id) data.sortOrder = nextSortOrder(areas, data.parentId, id);

  try {
    if (id) await db.erpArea.update({ where: { id }, data });
    else await db.erpArea.create({ data: { ...data, sortOrder: data.sortOrder ?? 0 } });
  } catch (e) {
    return duplicateCode(e) ?? fromDbError(e);
  }
  revalidatePath("/team");
  revalidatePath("/admin/users");
  return { ok: true };
}

export async function deleteArea(id: string): Promise<FormState> {
  await requireAction("areas.manage");
  if (await db.erpArea.count({ where: { parentId: id } })) {
    return { ok: false, message: "Delete or move its sub-modules first." };
  }
  try {
    await db.erpArea.delete({ where: { id } });
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
  const { areaId, members, lead, designers } = parsed.data;

  const users = await db.user.findMany({ where: { id: { in: members } }, select: { id: true, role: true, designer: true } });
  if (users.length !== new Set(members).size) return { ok: false, message: "Someone in the list no longer exists. Refresh the page." };
  if (lead && users.find((u) => u.id === lead)?.role === "QA") return { ok: false, message: "The lead must be a developer or an admin." };
  if (designers.some((d) => !users.find((u) => u.id === d)?.designer)) {
    return { ok: false, message: "Only people with the Designer tick-box (Users) can work on a module as its UI/UX designer." };
  }

  try {
    await db.$transaction([
      db.areaMember.deleteMany({ where: { areaId } }),
      db.areaMember.createMany({
        data: [...new Set(members)].map((userId) => ({ areaId, userId, isLead: userId === lead, asDesigner: designers.includes(userId) })),
      }),
    ]);
  } catch (e) {
    return fromDbError(e);
  }
  revalidatePath("/team");
  revalidatePath("/admin/users");
  return { ok: true };
}
