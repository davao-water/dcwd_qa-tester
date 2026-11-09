import { z } from "zod";

export const areaInput = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .max(20)
    .refine((v) => v === "" || /^[A-Z0-9][A-Z0-9-]{1,19}$/.test(v), "2–20 letters, digits or dashes")
    .transform((v) => (v ? v : null)),
  parentId: z
    .string()
    .trim()
    .transform((v) => (v ? v : null)),
  /** Only top-level modules show this field. A sub-module leaves it out and is placed after its siblings. */
  sortOrder: z.coerce.number().int().min(0).max(999).optional(),
  active: z.boolean(),
});

export type AreaInput = z.infer<typeof areaInput>;

export const areaMembersInput = z
  .object({
    areaId: z.string().min(1),
    members: z.array(z.string().min(1)).max(200),
    lead: z
      .string()
      .transform((v) => (v ? v : null)),
    /** Members who work on this module as its UI/UX designer. */
    designers: z.array(z.string().min(1)).max(200).default([]),
  })
  .refine((v) => !v.lead || v.members.includes(v.lead), { message: "The lead must also be a member", path: ["lead"] })
  .refine((v) => v.designers.every((d) => v.members.includes(d)), { message: "A UI/UX designer must also be a member", path: ["designers"] });
