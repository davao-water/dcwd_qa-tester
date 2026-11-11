import type { Role } from "@/lib/auth/permissions";

/** A module or sub-module's own fields, as the Edit dialog fills them in. */
export type AreaValues = {
  id: string;
  name: string;
  code: string | null;
  parentId: string | null;
  sortOrder: number;
  active: boolean;
};
/** `designer`: has the Designer tick-box, so they can work on a module as its UI/UX designer. */
export type PersonOption = { id: string; name: string; role: Role; designer: boolean };
/** Someone already in an area: are they its lead, and do they work there as its UI/UX designer. */
export type MemberValue = { userId: string; isLead: boolean; asDesigner: boolean };
/** A module or sub-module in the Assign to modules list. `inside`: the areas inside it, at every depth. */
export type AreaOption = { id: string; name: string; code: string | null; depth: number; inside: string[]; hidden: boolean };
