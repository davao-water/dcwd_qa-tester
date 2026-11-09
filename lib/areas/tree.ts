// The ERP area directory: modules, their sub-modules, and one more level under those (Procurement › Purchase
// Requisition › Approval). Each area points at its parent; this file turns that into a tree and keeps it within
// MAX_DEPTH. Pure functions, unit-tested.

export type AreaNode = { id: string; parentId: string | null; name: string; sortOrder: number };
/** An area with the areas inside it, at every depth. */
export type TreeNode<T> = T & { children: TreeNode<T>[] };
export type AreaTree<T extends AreaNode> = TreeNode<T>[];

/** How many levels deep the directory goes: module › sub-module › one more. */
export const MAX_DEPTH = 3;
/** What each level is called, from the top. */
export const LEVEL_NAMES = ["module", "sub-module", "sub-module"] as const;

const byOrder = (a: AreaNode, b: AreaNode) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);

/** The areas as a tree, each level in its sort order. An area whose parent is missing is left out. */
export function buildTree<T extends AreaNode>(areas: T[]): AreaTree<T> {
  const under = (parentId: string | null, seen: Set<string>): TreeNode<T>[] =>
    areas
      .filter((a) => a.parentId === parentId && !seen.has(a.id))
      .sort(byOrder)
      .map((a) => ({ ...a, children: under(a.id, new Set(seen).add(a.id)) }));
  return under(null, new Set());
}

/** Every area in a tree, parents before their children. */
export function flatten<T>(tree: TreeNode<T>[]): TreeNode<T>[] {
  return tree.flatMap((n) => [n, ...flatten(n.children)]);
}

/** The chain from the top-level module down to the area `id` (inclusive), or [] when it isn't in the tree. */
export function pathTo<T extends { id: string }>(tree: TreeNode<T>[], id: string): TreeNode<T>[] {
  for (const n of tree) {
    if (n.id === id) return [n];
    const below = pathTo(n.children, id);
    if (below.length) return [n, ...below];
  }
  return [];
}

/** How deep an area sits: 1 for a module, 2 for a sub-module, 3 below that. 0 when it isn't there. */
export function depthOf(areas: { id: string; parentId: string | null }[], id: string | null): number {
  const parentOf = new Map(areas.map((a) => [a.id, a.parentId]));
  if (!id || !parentOf.has(id)) return 0;
  const seen = new Set<string>();
  let depth = 1;
  for (let at = id; parentOf.get(at) && !seen.has(at); at = parentOf.get(at)!) {
    seen.add(at);
    depth++;
  }
  return depth;
}

/** An area and everything inside it, at every depth. */
export function descendantIds(areas: { id: string; parentId: string | null }[], id: string): string[] {
  const out = [id];
  for (let i = 0; i < out.length; i++) for (const a of areas) if (a.parentId === out[i] && !out.includes(a.id)) out.push(a.id);
  return out;
}

/** The top-level module an area belongs to (itself for a module). Unknown ids map to themselves. */
export function rootOf(areas: { id: string; parentId: string | null }[], id: string): string {
  const parentOf = new Map(areas.map((a) => [a.id, a.parentId]));
  const seen = new Set<string>();
  let at = id;
  while (parentOf.get(at) && !seen.has(at)) {
    seen.add(at);
    at = parentOf.get(at)!;
  }
  return at;
}

/** Levels below an area, counting itself: 1 for one with nothing inside. */
function heightOf(areas: AreaNode[], id: string): number {
  const kids = areas.filter((a) => a.parentId === id);
  return 1 + (kids.length ? Math.max(...kids.map((k) => heightOf(areas, k.id))) : 0);
}

/** Why the area can't be saved where it is, or null when it can. `input.id` is set when editing. */
export function placementError(areas: AreaNode[], input: { id?: string; parentId: string | null; name: string }): string | null {
  if (input.parentId) {
    if (input.parentId === input.id) return "An area can't be inside itself.";
    const parent = areas.find((a) => a.id === input.parentId);
    if (!parent) return "The parent module no longer exists. Refresh the page.";
    if (input.id && descendantIds(areas, input.id).includes(input.parentId)) return "An area can't be moved inside one of its own sub-modules.";
    // The area (with whatever is already inside it) must still fit within MAX_DEPTH levels.
    const height = input.id ? heightOf(areas, input.id) : 1;
    if (depthOf(areas, input.parentId) + height > MAX_DEPTH) {
      return height > 1
        ? `Moving it there would make the directory deeper than ${MAX_DEPTH} levels. Move or delete what's inside it first.`
        : `Modules go ${MAX_DEPTH} levels deep at most. Pick a module or a sub-module that isn't already at the last level.`;
    }
  }
  const name = input.name.trim().toLowerCase();
  const clash = areas.some((a) => a.id !== input.id && a.parentId === input.parentId && a.name.trim().toLowerCase() === name);
  if (clash) return input.parentId ? "This module already has a sub-module with that name." : "A module with that name already exists.";
  return null;
}

/** Whether something more can go inside this area (it isn't at the last level). */
export const canHaveChildren = (areas: AreaNode[], id: string) => depthOf(areas, id) < MAX_DEPTH;

/** The sort order that places a new area after its siblings (steps of 10, so admins can slot one in between). */
export function nextSortOrder(areas: AreaNode[], parentId: string | null, excludeId?: string): number {
  const siblings = areas.filter((a) => a.parentId === parentId && a.id !== excludeId);
  return siblings.length ? Math.min(999, Math.max(...siblings.map((a) => a.sortOrder)) + 10) : 0;
}

type OptionNode = { id: string; name: string; children?: OptionNode[] };

/**
 * A dropdown's choices as a tree: each module in bold with `wholeNote` beside it, then its sub-modules and theirs,
 * indented by level. Once chosen, an area shows its whole path ("Procurement › Purchase Requisition › Approval"), so
 * it's clear where it came from even when two share a name.
 */
export function moduleOptions(areas: OptionNode[], wholeNote: string) {
  const rows = (nodes: OptionNode[], parents: string[]): { value: string; label: string; tree: { name: string; level: 0 | 1 | 2; note?: string } }[] =>
    nodes.flatMap((n) => [
      { value: n.id, label: [...parents, n.name].join(" › "), tree: { name: n.name, level: Math.min(2, parents.length) as 1 | 2 } },
      ...rows(n.children ?? [], [...parents, n.name]),
    ]);
  return areas.map((m) => ({
    rule: true,
    options: [{ value: m.id, label: `${m.name} (${wholeNote})`, tree: { name: m.name, level: 0 as const, note: wholeNote } }, ...rows(m.children ?? [], [m.name])],
  }));
}

/** An area with its parents, as Prisma selects it (AREA_PATH_SELECT). */
export type AreaWithParents = { name: string; parent?: AreaWithParents | null };

/** What to select for an area so areaPath can name it in full (MAX_DEPTH levels). */
export const AREA_PATH_SELECT = { name: true, parent: { select: { name: true, parent: { select: { name: true } } } } } as const;

/** The top-level module's name of an area selected with AREA_PATH_SELECT. */
export function rootName(area: AreaWithParents): string {
  return area.parent ? rootName(area.parent) : area.name;
}

/** "Procurement › Purchase Requisition › Approval", or just the module name. */
export function areaPath(area: AreaWithParents): string {
  return area.parent ? `${areaPath(area.parent)} › ${area.name}` : area.name;
}
