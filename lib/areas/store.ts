// Team & modules' saving and loading: the module list with who works on each, and adding, editing, deleting modules
// and setting their members. The screen's actions check the form and permissions, then call these. The dashboard
// reads its team and module counts here too.

import type { PrismaClient } from "@/lib/generated/prisma/client";
import type { AreaInput } from "@/lib/schemas/area";
import { AREA_PATH_SELECT, nextSortOrder, placementError } from "./tree";

/** An area's member list as the Members dialog sends it. */
export type AreaMembers = { areaId: string; members: string[]; lead: string | null; designers: string[] };

export function areaStore(db: PrismaClient) {
  return {
    /** Every module and sub-module, with its active members and what they do there. */
    areasWithMembers() {
      return db.erpArea.findMany({
        select: {
          id: true,
          parentId: true,
          name: true,
          code: true,
          sortOrder: true,
          active: true,
          members: { where: { user: { active: true } }, select: { isLead: true, asDesigner: true, user: { select: { id: true, name: true, role: true, designer: true } } } },
        },
      });
    },

    /** Everyone who can sign in, by name: the people a module can be given. */
    activePeople() {
      return db.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, role: true, designer: true, teamLead: true } });
    },

    /** Active QA testers by name (the admin dashboard's tester count and its module filter). */
    activeQaTesters() {
      return db.user.findMany({ where: { active: true, role: "QA" }, orderBy: { name: "asc" }, select: { id: true, name: true } });
    },

    /** How many active developers there are. */
    activeDeveloperCount() {
      return db.user.count({ where: { active: true, role: "DEV" } });
    },

    /** How many active modules and sub-modules there are. */
    async activeModuleCounts(): Promise<{ modules: number; subModules: number }> {
      const [modules, subModules] = await Promise.all([
        db.erpArea.count({ where: { parentId: null, active: true } }),
        db.erpArea.count({ where: { parentId: { not: null }, active: true } }),
      ]);
      return { modules, subModules };
    },

    /** Active developers and QA testers who aren't in any module yet. */
    peopleWithoutModule() {
      return db.user.findMany({
        where: { active: true, role: { in: ["DEV", "QA"] }, areas: { none: {} } },
        orderBy: { name: "asc" },
        select: { id: true, name: true, role: true },
      });
    },

    /** The modules and sub-modules one person works on, with their full path and whether they lead it. */
    areasOf(userId: string) {
      return db.areaMember.findMany({
        where: { userId },
        select: { isLead: true, area: { select: { id: true, ...AREA_PATH_SELECT } } },
      });
    },

    /**
     * Adds a module or sub-module, or edits one (`id`). Returns a message a user can act on when it can't go there,
     * otherwise null. A database error (such as a code already in use) is thrown for the caller to explain.
     */
    async save(id: string | undefined, input: AreaInput): Promise<string | null> {
      const areas = await db.erpArea.findMany({ select: { id: true, parentId: true, name: true, sortOrder: true } });
      const problem = placementError(areas, { id, parentId: input.parentId, name: input.name });
      if (problem) return problem;

      // No sort order in the form (sub-modules): a new one goes after its siblings, an edited one keeps its place.
      const data = { ...input };
      if (data.sortOrder === undefined && !id) data.sortOrder = nextSortOrder(areas, data.parentId, id);

      if (id) await db.erpArea.update({ where: { id }, data });
      else await db.erpArea.create({ data: { ...data, sortOrder: data.sortOrder ?? 0 } });
      return null;
    },

    /** Deletes an area with nothing inside it (its member list goes too). Returns why it can't, otherwise null. */
    async remove(id: string): Promise<string | null> {
      if (await db.erpArea.count({ where: { parentId: id } })) return "Delete or move its sub-modules first.";
      await db.erpArea.delete({ where: { id } });
      return null;
    },

    /** Replaces an area's members, its lead and its UI/UX designers. Returns a message when the list is wrong, otherwise null. */
    async setMembers({ areaId, members, lead, designers }: AreaMembers): Promise<string | null> {
      const users = await db.user.findMany({ where: { id: { in: members } }, select: { id: true, role: true, designer: true } });
      if (users.length !== new Set(members).size) return "Someone in the list no longer exists. Refresh the page.";
      if (lead && users.find((u) => u.id === lead)?.role === "QA") return "The lead must be a developer or an admin.";
      if (designers.some((d) => !users.find((u) => u.id === d)?.designer)) {
        return "Only people with the Designer tick-box (Users) can work on a module as its UI/UX designer.";
      }

      await db.$transaction([
        db.areaMember.deleteMany({ where: { areaId } }),
        db.areaMember.createMany({
          data: [...new Set(members)].map((userId) => ({ areaId, userId, isLead: userId === lead, asDesigner: designers.includes(userId) })),
        }),
      ]);
      return null;
    },
  };
}
