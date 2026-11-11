import { buildTree, type TreeNode } from "@/lib/areas/tree";
import type { Role } from "@/lib/auth/permissions";
import type { PrismaClient } from "@/lib/generated/prisma/client";

// The lists the ticket screens offer: modules to pick, developers to assign, QA testers to filter by. The DAR setup
// screen reuses the module list.

/** A module with what's inside it, at every level (lib/areas/tree.ts). */
export type AreaOption = { id: string; name: string; children: AreaOption[] };
/** A developer or admin, with the areas they belong to, so the picker can suggest the right people. */
export type AssigneeOption = { id: string; name: string; role: Role; areaIds: string[]; leadAreaIds: string[] };

/** Everyone who files tickets (QA testers and admins), for the QA tester filter. Inactive people keep their tickets, so they are listed too. */
export async function reporterOptions(db: PrismaClient): Promise<{ id: string; name: string; active: boolean }[]> {
  return db.user.findMany({ where: { role: { in: ["QA", "ADMIN"] } }, orderBy: [{ active: "desc" }, { name: "asc" }], select: { id: true, name: true, active: true } });
}

/** An area and what's inside it, with only what the pickers need. */
const toOption = (n: TreeNode<{ id: string; name: string }>): AreaOption => ({ id: n.id, name: n.name, children: n.children.map(toOption) });

/** Active modules and sub-modules (every level), plus the developers and admins who can be assigned, with their areas. */
export async function ticketFormOptions(db: PrismaClient): Promise<{ areas: AreaOption[]; people: AssigneeOption[] }> {
  const [areas, users] = await Promise.all([
    db.erpArea.findMany({ where: { active: true }, select: { id: true, parentId: true, name: true, sortOrder: true } }),
    db.user.findMany({
      // Only developers can be assigned; tickets already with an admin keep them until someone reassigns.
      where: { active: true, role: "DEV" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, role: true, areas: { select: { areaId: true, isLead: true } } },
    }),
  ]);
  return {
    areas: buildTree(areas).map(toOption),
    people: users.map((u) => ({
      id: u.id,
      name: u.name,
      role: u.role as Role,
      areaIds: u.areas.map((a) => a.areaId),
      leadAreaIds: u.areas.filter((a) => a.isLead).map((a) => a.areaId),
    })),
  };
}
