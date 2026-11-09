// The fixed text of a DAR (name, office, signatories, duties and MFOs). Each person sets up their own once under
// My DAR → My details (DarProfile); there is no shared template, so a new account starts empty. Stored JSON that no
// longer matches falls back to empty instead of breaking the page.

import { z } from "zod";
import { DEFAULT_SCHEME, PERIOD_SCHEMES, parsePeriod, schemeOfStart } from "./period";

const line = (max: number) => z.string().trim().max(max);

/**
 * One row of the duties grid: a duty, one MFO and a day-by-day row. A duty with several MFOs takes several rows; the
 * ones after the first are marked `continues` and leave the duty empty, and the report merges the duty cell down them.
 */
export const darFunction = z
  .object({
    duty: line(1000).default(""),
    mfo: line(1000).default(""),
    /** This row gets the day-by-day entries filled from ticket activity. */
    autofill: z.boolean().default(false),
    /** Another MFO of the duty in the row above. */
    continues: z.boolean().optional(),
    /**
     * With `autofill`: the modules (any level, everything inside them included) whose ticket work fills this row. None:
     * the row takes ticket work that no other row is linked to.
     */
    areaIds: z.array(z.string().min(1)).max(20).optional(),
  })
  .refine((f) => f.continues || f.duty.length > 0, { message: "Describe the duty.", path: ["duty"] });
export type DarFunction = z.infer<typeof darFunction>;

/** Up to 20 rows per section: a duty with several MFOs takes one row per MFO. */
export const MAX_FUNCTION_ROWS = 20;
const functionList = z
  .array(darFunction)
  .max(MAX_FUNCTION_ROWS)
  // The first row can't continue anything; a continuing row has no duty of its own.
  .transform((rows) => rows.map((f, i) => (i === 0 && f.continues ? { ...f, continues: false } : f.continues ? { ...f, duty: "" } : f)))
  .refine((rows) => !rows.length || rows[0].duty.length > 0, { message: "Describe the duty." });

/** A row's place in its duty group, for drawing: its item number and how many rows its duty cell spans (0 = merged into the row above). */
export function dutyLayout(fns: DarFunction[]): { number: number; span: number }[] {
  const out: { number: number; span: number }[] = [];
  let n = 0;
  fns.forEach((f, i) => {
    if (f.continues && i > 0) {
      out.push({ number: n, span: 0 });
      // Grow the span of the group's first row.
      for (let j = i - 1; j >= 0; j--) if (out[j].span > 0) { out[j].span++; break; }
    } else out.push({ number: ++n, span: 1 });
  });
  return out;
}
const signatory = z.object({ name: line(120).default(""), title: line(160).default("") });
export type Signatory = z.infer<typeof signatory>;

/** Everything a person saves under My details. Empty fields stay empty on the report. */
export const darProfileInput = z.object({
  fullName: line(120),
  position: line(120),
  department: line(160),
  unit: line(160),
  /** Immediate supervisor; also signs "Confirmed by". */
  confirmedBy: signatory,
  notedBy: signatory,
  coreFunctions: functionList,
  supportFunctions: functionList,
  /** The start of their first period, which their list of periods starts from. */
  firstPeriodStart: z.string().refine((v) => v === "" || !!parsePeriod(v), "Pick the month and period of your first DAR.").optional(),
  /** The days their periods start on (see lib/dar/period.ts). */
  periodScheme: z.enum(PERIOD_SCHEMES).optional(),
}).refine((v) => !v.firstPeriodStart || schemeOfStart(v.firstPeriodStart) === (v.periodScheme ?? DEFAULT_SCHEME), {
  message: "Pick your first period again: it doesn't match the period days you chose.",
  path: ["firstPeriodStart"],
});
export type DarProfileInput = z.infer<typeof darProfileInput>;

export type DarProfileRow = {
  fullName: string | null;
  position: string | null;
  department: string | null;
  unit: string | null;
  confirmedByName: string | null;
  confirmedByTitle: string | null;
  notedByName: string | null;
  notedByTitle: string | null;
  coreFunctions: unknown;
  supportFunctions: unknown;
} | null;

const functions = (v: unknown): DarFunction[] => {
  const r = functionList.safeParse(v);
  return r.success ? r.data : [];
};

const str = (v: string | null | undefined) => v?.trim() ?? "";

export type DarHeader = {
  name: string;
  position: string;
  department: string;
  unit: string;
  supervisor: string;
  confirmedBy: Signatory;
  notedBy: Signatory;
  core: DarFunction[];
  support: DarFunction[];
};

/** The header and functions as they appear on the report: the person's own details; the name falls back to the account. */
export function resolveHeader(profile: DarProfileRow, user: { name: string }): DarHeader {
  const confirmedBy = { name: str(profile?.confirmedByName), title: str(profile?.confirmedByTitle) };
  return {
    name: str(profile?.fullName) || user.name,
    position: str(profile?.position),
    department: str(profile?.department),
    unit: str(profile?.unit),
    supervisor: confirmedBy.name,
    confirmedBy,
    notedBy: { name: str(profile?.notedByName), title: str(profile?.notedByTitle) },
    core: functions(profile?.coreFunctions),
    support: functions(profile?.supportFunctions),
  };
}

/** Nothing to report yet: no duty rows, so the page asks them to set up their DAR first. */
export const isEmptySetup = (h: DarHeader) => !h.core.length && !h.support.length;

/**
 * The shared admin template that QA Hub had until 2026-11-01, with its built-in values. Only used to restore an older
 * backup: anyone who already had a DAR keeps what it showed (migration 20261101000300_dar_own_details does the same).
 */
export const LEGACY_TEMPLATE = {
  position: "System Analyst",
  department: "Information and Communication Technology Department",
  unit: "Data Management Unit",
  confirmedBy: { name: "Verlie S. Tuyor", title: "OIC, Data Management Unit" },
  notedBy: { name: "Engr. Anne Michelle S. Buagas", title: "Manager, Information and Communication Technology Department" },
  coreFunctions: [
    {
      duty:
        "Performs API testing, automation testing, and performance validation for ERP system (HR, Procurement (BUR), Property and Supply Management System (PSMS), Project Monitoring System (PrMS), DCWD Mobile Application and Leak Alert), including data validation, defect identification, and test documentation.",
      mfo: [
        "• Gathering information of End-Users (PSMS)",
        "• Performs documentation and test reports",
        "• Create Test Cases for (ERP) Procurement, Property and Supply Management System (PSMS), DCWD Mobile Application and Leak Alert",
        "• Evaluated system speed, stability, and response using K-6 automation",
        "• Verified API's function correctly and meet requirements",
      ].join("\n"),
      autofill: true,
    },
  ],
  supportFunctions: [
    {
      duty: "Assist in the accurate encoding of data submitted by end-users.",
      mfo: "Data entries on ERP (HR, Procurement, Property and Supply Management System (PSMS), DCWD Mobile Application and Leak Alert)",
      autofill: false,
    },
    {
      duty: "Reviews entered data for integrity, accuracy, completeness, and consistency on ERP (HR, PROCUREMENT (BUR), PSMS, PrMS, DCWD MOBILE APP and LEAK ALERT)",
      mfo: "Data entries on ERP (HR, Procurement, Property and Supply Management System (PSMS), DCWD Mobile Application and Leak Alert) has been correctly evaluated",
      autofill: true,
    },
    { duty: "Perform other related functions as may be required by the immediate supervisor", mfo: "Accomplishment Report", autofill: false },
  ],
};

const legacyTemplate = z.object({
  position: z.string().catch(LEGACY_TEMPLATE.position),
  department: z.string().catch(LEGACY_TEMPLATE.department),
  unit: z.string().catch(LEGACY_TEMPLATE.unit),
  confirmedBy: signatory.catch(LEGACY_TEMPLATE.confirmedBy),
  notedBy: signatory.catch(LEGACY_TEMPLATE.notedBy),
  coreFunctions: functionList.catch(LEGACY_TEMPLATE.coreFunctions),
  supportFunctions: functionList.catch(LEGACY_TEMPLATE.supportFunctions),
});

const isEmptyJson = (v: unknown) => v == null || (Array.isArray(v) && !v.length);

/** A DarProfile row from an old backup with the old template's values in every field it left empty. */
export function adoptLegacyTemplate<T extends Record<string, unknown>>(row: T, storedTemplate: unknown): T {
  const t = legacyTemplate.parse(typeof storedTemplate === "object" && storedTemplate ? { ...LEGACY_TEMPLATE, ...storedTemplate } : LEGACY_TEMPLATE);
  const keep = (key: string, value: unknown) => (row[key] == null || row[key] === "" ? value : row[key]);
  return {
    ...row,
    position: keep("position", t.position),
    department: keep("department", t.department),
    unit: keep("unit", t.unit),
    confirmedByName: keep("confirmedByName", t.confirmedBy.name),
    confirmedByTitle: keep("confirmedByTitle", t.confirmedBy.title),
    notedByName: keep("notedByName", t.notedBy.name),
    notedByTitle: keep("notedByTitle", t.notedBy.title),
    coreFunctions: isEmptyJson(row.coreFunctions) ? t.coreFunctions : row.coreFunctions,
    supportFunctions: isEmptyJson(row.supportFunctions) ? t.supportFunctions : row.supportFunctions,
  };
}

/** "Reuben John F. Lisondra" → "RJFL", as in the report file names. */
export function nameInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w.replace(/[^A-Za-z]/g, "")[0] ?? "")
    .join("")
    .toUpperCase();
}
