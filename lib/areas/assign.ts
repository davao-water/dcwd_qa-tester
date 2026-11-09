// Team & modules → "Assign to modules": add the same people to many modules and sub-modules in one go. Unlike an
// area's Members list, this only adds: whoever is already in an area stays there.

import type { PrismaClient } from "@/lib/generated/prisma/client";

export type AreaAssignment = {
  areaIds: string[];
  members: string[];
  /** Becomes the lead of every chosen area, in place of its current lead (who stays a member). */
  lead: string | null;
  /** Work on every chosen area as its UI/UX designer. */
  designers: string[];
};

/** Adds the people to every area. Returns a message a user can act on when something is wrong, otherwise null. */
export async function addToAreas(db: PrismaClient, input: AreaAssignment): Promise<string | null> {
  const areaIds = [...new Set(input.areaIds)];
  const members = [...new Set(input.members)];
  const designers = [...new Set(input.designers)];
  const { lead } = input;
  if (!areaIds.length) return "Tick at least one module.";
  if (!members.length) return "Tick at least one person.";

  const [users, areaCount] = await Promise.all([
    db.user.findMany({ where: { id: { in: members }, active: true }, select: { id: true, role: true, designer: true } }),
    db.erpArea.count({ where: { id: { in: areaIds } } }),
  ]);
  if (users.length !== members.length) return "Someone in the list no longer exists or was deactivated. Refresh the page.";
  if (areaCount !== areaIds.length) return "A module in the list no longer exists. Refresh the page.";
  if (lead && !members.includes(lead)) return "The lead must also be ticked.";
  if (lead && users.find((u) => u.id === lead)?.role === "QA") return "The lead must be a developer or an admin.";
  if (designers.some((d) => !members.includes(d))) return "A UI/UX designer must also be ticked.";
  if (designers.some((d) => !users.find((u) => u.id === d)?.designer)) {
    return "Only people with the Designer tick-box (Users) can work on a module as its UI/UX designer.";
  }

  const inAreas = { areaId: { in: areaIds } };
  await db.$transaction([
    // New memberships; people already in an area keep their row as it is.
    db.areaMember.createMany({
      data: areaIds.flatMap((areaId) => members.map((userId) => ({ areaId, userId, asDesigner: designers.includes(userId) }))),
      skipDuplicates: true,
    }),
    // Those already there who were ticked as UI/UX become it too (nobody loses UI/UX here).
    ...(designers.length ? [db.areaMember.updateMany({ where: { ...inAreas, userId: { in: designers } }, data: { asDesigner: true } })] : []),
    // One lead per area: the chosen lead replaces the current one.
    ...(lead
      ? [
          db.areaMember.updateMany({ where: { ...inAreas, isLead: true, userId: { not: lead } }, data: { isLead: false } }),
          db.areaMember.updateMany({ where: { ...inAreas, userId: lead }, data: { isLead: true } }),
        ]
      : []),
  ]);
  return null;
}
