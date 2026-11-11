import type { DarProfileRow } from "@/lib/dar/template";

/** A person's saved DAR details for a test, with any field overridden. */
export const profile = (p: Partial<NonNullable<DarProfileRow>> = {}): NonNullable<DarProfileRow> => ({
  fullName: null,
  position: null,
  department: null,
  unit: null,
  confirmedByName: null,
  confirmedByTitle: null,
  notedByName: null,
  notedByTitle: null,
  coreFunctions: null,
  supportFunctions: null,
  ...p,
});
