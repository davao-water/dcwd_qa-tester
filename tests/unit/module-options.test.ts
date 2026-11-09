import { describe, expect, it } from "vitest";
import { moduleOptions } from "@/lib/areas/tree";

const areas = [
  { id: "b", name: "Billing", children: [{ id: "p", name: "Posting" }, { id: "c", name: "Collection" }] },
  { id: "m", name: "Meter Reading", children: [] },
];

describe("moduleOptions", () => {
  it("lists a third level under its sub-module, named by its whole path", () => {
    const deep = [{ id: "pr", name: "Procurement", children: [{ id: "req", name: "Purchase Requisition", children: [{ id: "ap", name: "Approval", children: [] }] }, { id: "dash", name: "Dashboard", children: [] }] }];
    const [proc] = moduleOptions(deep, "whole module");
    expect(proc.options.map((o) => `${o.tree.level}:${o.tree.name}`)).toEqual(["0:Procurement", "1:Purchase Requisition", "2:Approval", "1:Dashboard"]);
    expect(proc.options[2].label).toBe("Procurement › Purchase Requisition › Approval");
  });

  it("lists each module with its sub-modules under it, in order", () => {
    const groups = moduleOptions(areas, "whole module");
    expect(groups.map((g) => g.options.map((o) => `${o.tree.level}:${o.tree.name}`))).toEqual([["0:Billing", "1:Posting", "1:Collection"], ["0:Meter Reading"]]);
    expect(groups.every((g) => g.rule)).toBe(true);
  });

  it("names a chosen sub-module with the module it comes from", () => {
    const [billing] = moduleOptions(areas, "all");
    expect(billing.options.map((o) => o.label)).toEqual(["Billing (all)", "Billing › Posting", "Billing › Collection"]);
    expect(billing.options[0].tree).toEqual({ name: "Billing", level: 0, note: "all" });
  });
});
