import { describe, expect, it } from "vitest";
import { adoptLegacyTemplate, isEmptySetup, LEGACY_TEMPLATE, nameInitials, resolveHeader } from "@/lib/dar/template";
import { profile } from "./helpers/dar-profile";

// DAR details: each person's header, template and file-name initials.

describe("DAR details", () => {
  it("starts everyone empty, apart from the account name", () => {
    const h = resolveHeader(null, { name: "Rj" });
    expect(h).toEqual({
      name: "Rj",
      position: "",
      department: "",
      unit: "",
      supervisor: "",
      confirmedBy: { name: "", title: "" },
      notedBy: { name: "", title: "" },
      core: [],
      support: [],
    });
    expect(isEmptySetup(h)).toBe(true);
  });

  it("shows the person's own details, and ignores a bad stored list", () => {
    const mine = [{ duty: "My duty", mfo: "Mine", autofill: true }];
    const h = resolveHeader(
      profile({ fullName: "Reuben John F. Lisondra", position: " Developer ", unit: "Systems Unit", confirmedByName: "Boss", confirmedByTitle: "OIC", coreFunctions: mine, supportFunctions: "bad" }),
      { name: "Rj" },
    );
    expect(h).toMatchObject({ name: "Reuben John F. Lisondra", position: "Developer", unit: "Systems Unit", supervisor: "Boss", confirmedBy: { name: "Boss", title: "OIC" }, core: mine, support: [] });
    expect(isEmptySetup(h)).toBe(false);
  });

  it("gives an old backup's DAR users the old template, keeping what they had set", () => {
    const own = [{ duty: "Own", mfo: "", autofill: false }];
    const row = adoptLegacyTemplate({ userId: "u1", ...profile({ fullName: "Ana", position: "Tester", coreFunctions: own }) }, { unit: "QA Unit" });
    expect(row).toMatchObject({ userId: "u1", fullName: "Ana", position: "Tester", unit: "QA Unit", department: LEGACY_TEMPLATE.department, confirmedByName: LEGACY_TEMPLATE.confirmedBy.name });
    expect(row.coreFunctions).toEqual(own);
    expect(row.supportFunctions).toEqual(LEGACY_TEMPLATE.supportFunctions);
    // No stored template, or a broken one: the built-in values.
    expect(adoptLegacyTemplate({ userId: "u2" }, undefined)).toMatchObject({ position: LEGACY_TEMPLATE.position, coreFunctions: LEGACY_TEMPLATE.coreFunctions });
    expect(adoptLegacyTemplate({ userId: "u3" }, { unit: 5 })).toMatchObject({ unit: LEGACY_TEMPLATE.unit });
  });

  it("makes file-name initials", () => {
    expect(nameInitials("Reuben John F. Lisondra")).toBe("RJFL");
    expect(nameInitials("  ana  dela cruz ")).toBe("ADC");
  });
});
