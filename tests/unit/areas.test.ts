import { describe, expect, it } from "vitest";
import { areaPath, buildTree, canHaveChildren, depthOf, descendantIds, flatten, nextSortOrder, pathTo, placementError, rootName, rootOf, type AreaNode } from "@/lib/areas/tree";
import { areaInput, areaMembersInput } from "@/lib/schemas/area";
import { passwordChangeInput, userInput } from "@/lib/schemas/user";

const areas: AreaNode[] = [
  { id: "bca", parentId: null, name: "Billing & Collection", sortOrder: 0 },
  { id: "fin", parentId: null, name: "Finance", sortOrder: 10 },
  { id: "mr", parentId: "bca", name: "Meter Reading", sortOrder: 20 },
  { id: "col", parentId: "bca", name: "Collection", sortOrder: 10 },
  { id: "nsc", parentId: "bca", name: "NSC", sortOrder: 10 },
];

describe("area tree", () => {
  const deep: AreaNode[] = [
    ...areas,
    { id: "up", parentId: "mr", name: "Reading Upload", sortOrder: 10 },
    { id: "rv", parentId: "mr", name: "Review", sortOrder: 0 },
  ];

  it("nests a third level and finds paths, depths, roots and everything inside", () => {
    const tree = buildTree(deep);
    const mr = tree[0].children.find((c) => c.id === "mr")!;
    expect(mr.children.map((c) => c.id)).toEqual(["rv", "up"]);
    expect(flatten(tree).map((a) => a.id)).toEqual(["bca", "col", "nsc", "mr", "rv", "up", "fin"]);
    expect(pathTo(tree, "up").map((a) => a.name)).toEqual(["Billing & Collection", "Meter Reading", "Reading Upload"]);
    expect(pathTo(tree, "nope")).toEqual([]);
    expect([depthOf(deep, "bca"), depthOf(deep, "mr"), depthOf(deep, "up"), depthOf(deep, "nope")]).toEqual([1, 2, 3, 0]);
    expect(rootOf(deep, "up")).toBe("bca");
    expect(rootOf(deep, "fin")).toBe("fin");
    expect(descendantIds(deep, "bca").sort()).toEqual(["bca", "col", "mr", "nsc", "rv", "up"]);
    expect(descendantIds(deep, "mr").sort()).toEqual(["mr", "rv", "up"]);
  });

  it("names an area by its whole path", () => {
    const upload = { name: "Reading Upload", parent: { name: "Meter Reading", parent: { name: "Billing & Collection" } } };
    expect(areaPath(upload)).toBe("Billing & Collection › Meter Reading › Reading Upload");
    expect(rootName(upload)).toBe("Billing & Collection");
    expect(rootName({ name: "Finance", parent: null })).toBe("Finance");
  });

  it("groups sub-modules under modules in sort order, then by name", () => {
    const tree = buildTree(areas);
    expect(tree.map((m) => m.id)).toEqual(["bca", "fin"]);
    expect(tree[0].children.map((c) => c.id)).toEqual(["col", "nsc", "mr"]);
    expect(tree[1].children).toEqual([]);
  });

  it("formats the path", () => {
    expect(areaPath({ name: "Meter Reading", parent: { name: "Billing & Collection" } })).toBe("Billing & Collection › Meter Reading");
    expect(areaPath({ name: "Finance", parent: null })).toBe("Finance");
  });
});

describe("placementError", () => {
  it("allows a new module and a new sub-module", () => {
    expect(placementError(areas, { parentId: null, name: "HR & Payroll" })).toBeNull();
    expect(placementError(areas, { parentId: "bca", name: "Billing Run" })).toBeNull();
    expect(placementError(areas, { id: "mr", parentId: "bca", name: "Meter Reading" })).toBeNull();
    expect(placementError(areas, { id: "mr", parentId: "fin", name: "Meter Reading" })).toBeNull();
  });

  it("allows a third level, and no deeper", () => {
    // Billing & Collection › Meter Reading › Reading Upload is fine…
    expect(placementError(areas, { parentId: "mr", name: "Reading Upload" })).toBeNull();
    const three: AreaNode[] = [...areas, { id: "up", parentId: "mr", name: "Reading Upload", sortOrder: 0 }];
    // …but nothing goes inside the third level.
    expect(placementError(three, { parentId: "up", name: "Too deep" })).toMatch(/3 levels deep at most/);
    // Moving a module that has a sub-module (and one under that) inside another module would make four levels.
    expect(placementError(three, { id: "bca", parentId: "fin", name: "Billing & Collection" })).toMatch(/deeper than 3 levels/);
    // A module with only sub-modules can go inside another module: three levels.
    expect(placementError(areas, { id: "bca", parentId: "fin", name: "Billing & Collection" })).toBeNull();
    expect(canHaveChildren(three, "mr")).toBe(true);
    expect(canHaveChildren(three, "up")).toBe(false);
  });

  it("won't move an area inside its own sub-module", () => {
    const three: AreaNode[] = [...areas, { id: "up", parentId: "mr", name: "Reading Upload", sortOrder: 0 }];
    expect(placementError(three, { id: "bca", parentId: "up", name: "Billing & Collection" })).toMatch(/its own sub-modules/);
  });

  it("rejects cycles and missing parents", () => {
    expect(placementError(areas, { id: "fin", parentId: "fin", name: "Finance" })).toMatch(/inside itself/);
    expect(placementError(areas, { parentId: "gone", name: "X" })).toMatch(/no longer exists/);
  });

  it("rejects duplicate names among siblings, ignoring case and spaces", () => {
    expect(placementError(areas, { parentId: null, name: " finance " })).toMatch(/module with that name/);
    expect(placementError(areas, { parentId: "bca", name: "meter reading" })).toMatch(/sub-module with that name/);
    expect(placementError(areas, { parentId: "fin", name: "Meter Reading" })).toBeNull();
  });
});

describe("area schemas", () => {
  const base = { name: "Meter Reading", code: "", parentId: "", sortOrder: "5", active: true };

  it("normalizes empty optional fields to null and upper-cases codes", () => {
    expect(areaInput.parse(base)).toEqual({ name: "Meter Reading", code: null, parentId: null, sortOrder: 5, active: true });
    // Sub-modules have no sort order field; the action places them after their siblings.
    expect(areaInput.parse({ ...base, sortOrder: undefined }).sortOrder).toBeUndefined();
    expect(areaInput.parse({ ...base, code: "bca-mr", parentId: "bca" })).toMatchObject({ code: "BCA-MR", parentId: "bca" });
  });

  it.each(["X", "has space", "-LEAD", "TOO-LONG-CODE-123456789"])("rejects code %j", (code) => {
    expect(areaInput.safeParse({ ...base, code }).success).toBe(false);
  });

  it("requires the lead to be a member", () => {
    expect(areaMembersInput.safeParse({ areaId: "a", members: ["u1", "u2"], lead: "u2" }).success).toBe(true);
    expect(areaMembersInput.safeParse({ areaId: "a", members: ["u1"], lead: "" }).success).toBe(true);
    expect(areaMembersInput.safeParse({ areaId: "a", members: ["u1"], lead: "u3" }).success).toBe(false);
  });

  it("marks members who work on the area as its UI/UX designer, and only members", () => {
    expect(areaMembersInput.parse({ areaId: "a", members: ["u1", "u2"], lead: "" }).designers).toEqual([]);
    expect(areaMembersInput.parse({ areaId: "a", members: ["u1", "u2"], lead: "u2", designers: ["u1"] }).designers).toEqual(["u1"]);
    expect(areaMembersInput.safeParse({ areaId: "a", members: ["u1"], lead: "", designers: ["u9"] }).success).toBe(false);
  });
});

describe("nextSortOrder", () => {
  const areas = [
    { id: "bca", parentId: null, name: "Billing & Collection", sortOrder: 0 },
    { id: "mr", parentId: "bca", name: "Meter Reading", sortOrder: 20 },
    { id: "col", parentId: "bca", name: "Collection", sortOrder: 10 },
  ];
  it("places a new sub-module after its siblings", () => {
    expect(nextSortOrder(areas, "bca")).toBe(30);
    expect(nextSortOrder(areas, "fin")).toBe(0);
    expect(nextSortOrder([{ id: "x", parentId: "p", name: "X", sortOrder: 995 }], "p")).toBe(999);
  });
});

describe("user schemas", () => {
  it("lower-cases emails and validates roles", () => {
    expect(userInput.parse({ name: " Ana ", email: " Ana@Davao-Water.GOV.PH ", role: "QA" })).toEqual({ name: "Ana", email: "ana@davao-water.gov.ph", role: "QA", designer: false, teamLead: false });
    expect(userInput.safeParse({ name: "Ana", email: "not-an-email", role: "QA" }).success).toBe(false);
    expect(userInput.safeParse({ name: "Ana", email: "a@davao-water.gov.ph", role: "OWNER" }).success).toBe(false);
  });

  it("checks new passwords", () => {
    const ok = { current: "old-password", next: "new-password-1", confirm: "new-password-1" };
    expect(passwordChangeInput.safeParse(ok).success).toBe(true);
    expect(passwordChangeInput.safeParse({ ...ok, next: "short", confirm: "short" }).success).toBe(false);
    expect(passwordChangeInput.safeParse({ ...ok, confirm: "different-1" }).success).toBe(false);
    expect(passwordChangeInput.safeParse({ ...ok, next: "old-password", confirm: "old-password" }).success).toBe(false);
  });
});
