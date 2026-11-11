// Reads a person's own DAR Excel workbook (the DCWD form, one sheet per period) so My DAR can be set up from it: the
// header, the signatories, the duties and MFOs, the period days, and each period's day entries. Runs in the browser:
// the file is never uploaded, only what this reads is sent when they click Import. Pure functions, unit-tested.
//
// The file is read by workbook.ts, each sheet by dar-sheet.ts; this puts the sheets together.

import { CELL_MAX, type DarCells } from "./autofill";
import { key, parseDarSheet, type ImportedSheet } from "./dar-sheet";
import { DEFAULT_SCHEME, periodDays, periodFor, periodLabel, PERIOD_SCHEMES, type Period, type PeriodScheme } from "./period";
import { MAX_FUNCTION_ROWS, type DarFunction, type DarProfileInput } from "./template";
import { DarImportError, MAX_IMPORT_BYTES, readWorkbook } from "./workbook";

export { columnIndex, DarImportError, MAX_IMPORT_BYTES, readWorkbook } from "./workbook";
export { excelDate } from "./dar-sheet";

export type ImportedPeriod = {
  period: Period;
  label: string;
  sheetName: string;
  cells: DarCells;
  /** Days with any entry. */
  filledDays: number;
  dateSubmitted: string | null;
};

export type DarImport = {
  profile: DarProfileInput & { periodScheme: PeriodScheme };
  periods: ImportedPeriod[];
  /** Things the person should check, in plain words. */
  warnings: string[];
};

/** The scheme most sheets start on: the 1st or 16th, or the 3rd or 18th (a day either side still counts). */
export function detectScheme(firstDays: string[]): PeriodScheme {
  const votes: Record<PeriodScheme, number> = { "1-16": 0, "3-18": 0 };
  for (const d of firstDays) {
    const day = Number(d.slice(8));
    if ([2, 3, 4, 17, 18, 19].includes(day)) votes["3-18"]++;
    else votes["1-16"]++;
  }
  return PERIOD_SCHEMES.reduce((best, s) => (votes[s] > votes[best] ? s : best), DEFAULT_SCHEME);
}

type Section = "core" | "support";

/**
 * Every duty row seen in any sheet, in the newest sheet's order, with rows only older sheets have added after the
 * other rows of their duty. A row is the same row in two sheets when its duty and MFO read the same.
 */
function mergeRows(sheets: ImportedSheet[], section: Section): { rows: DarFunction[]; keys: string[] } {
  const rows: DarFunction[] = [];
  const keys: string[] = [];
  const dutyOf: string[] = [];
  for (const sheet of sheets) {
    let duty = "";
    for (const { fn } of sheet[section]) {
      if (!fn.continues) duty = fn.duty;
      const k = `${key(duty)}|${key(fn.mfo)}`;
      if (keys.includes(k)) continue;
      // After the last row of the same duty, or at the end as a new duty.
      const lastOfDuty = dutyOf.lastIndexOf(key(duty));
      const at = lastOfDuty >= 0 ? lastOfDuty + 1 : rows.length;
      const row: DarFunction = lastOfDuty >= 0 ? { duty: "", mfo: fn.mfo, autofill: false, continues: true } : { duty, mfo: fn.mfo, autofill: false };
      rows.splice(at, 0, row);
      keys.splice(at, 0, k);
      dutyOf.splice(at, 0, key(duty));
    }
  }
  return { rows, keys };
}

/** Reads a DAR workbook into My details and one DAR per period. Throws DarImportError with a message to show. */
export function parseDarWorkbook(bytes: Uint8Array): DarImport {
  if (bytes.byteLength > MAX_IMPORT_BYTES) throw new DarImportError("This file is too big to be a DAR. Pick your DAR workbook (.xlsx).");
  const sheets = readWorkbook(bytes)
    .map(parseDarSheet)
    .filter((s): s is ImportedSheet => !!s && s.dates.length > 0)
    // Newest first: its header and rows lead.
    .sort((a, b) => b.dates[0].localeCompare(a.dates[0]));
  if (!sheets.length) throw new DarImportError("No DAR was found in this file. Each sheet should be the DAR form, with the core functions and a row of dates.");

  const warnings: string[] = [];
  const scheme = detectScheme(sheets.map((s) => s.dates[0]));
  const newest = sheets[0];
  const merged = { core: mergeRows(sheets, "core"), support: mergeRows(sheets, "support") };
  for (const section of ["core", "support"] as const) {
    if (merged[section].rows.length > MAX_FUNCTION_ROWS) {
      warnings.push(`Only the first ${MAX_FUNCTION_ROWS} ${section} function rows were kept; the file has ${merged[section].rows.length}.`);
      merged[section].rows.length = MAX_FUNCTION_ROWS;
      merged[section].keys.length = MAX_FUNCTION_ROWS;
    }
  }

  // One DAR per period. Two sheets for the same period (a copy kept by mistake): the newer one's entries win.
  const byPeriod = new Map<string, ImportedPeriod>();
  for (const sheet of [...sheets].reverse()) {
    const period = periodFor(sheet.dates[0], scheme);
    const days = periodDays(period).map((d) => d.date);
    const outside = sheet.dates.filter((d) => d < period.start || d > period.end);
    if (outside.length) warnings.push(`"${sheet.name}": ${outside.length} day${outside.length === 1 ? "" : "s"} outside ${periodLabel(period)} ${outside.length === 1 ? "was" : "were"} left out.`);
    const cellsFor = (section: Section) => {
      const out = merged[section].keys.map(() => days.map(() => ""));
      let duty = "";
      for (const { fn, days: entries } of sheet[section]) {
        if (!fn.continues) duty = fn.duty;
        const i = merged[section].keys.indexOf(`${key(duty)}|${key(fn.mfo)}`);
        if (i < 0) continue;
        days.forEach((d, j) => {
          if (entries[d]) out[i][j] = out[i][j] ? `${out[i][j]}; ${entries[d]}`.slice(0, CELL_MAX) : entries[d];
        });
      }
      return out;
    };
    const cells = { core: cellsFor("core"), support: cellsFor("support") };
    const filledDays = days.filter((_, j) => [...cells.core, ...cells.support].some((r) => r[j])).length;
    byPeriod.set(period.start, { period, label: periodLabel(period), sheetName: sheet.name, cells, filledDays, dateSubmitted: sheet.dateSubmitted });
  }
  const periods = [...byPeriod.values()].sort((a, b) => b.period.start.localeCompare(a.period.start));

  const cut = (s: string, n: number) => s.slice(0, n);
  return {
    profile: {
      fullName: cut(newest.fullName, 120),
      position: cut(newest.position, 120),
      department: cut(newest.department, 160),
      unit: cut(newest.unit, 160),
      confirmedBy: { name: cut(newest.confirmedBy.name, 120), title: cut(newest.confirmedBy.title, 160) },
      notedBy: { name: cut(newest.notedBy.name, 120), title: cut(newest.notedBy.title, 160) },
      coreFunctions: merged.core.rows,
      supportFunctions: merged.support.rows,
      firstPeriodStart: periods.at(-1)!.period.start,
      periodScheme: scheme,
    },
    periods,
    warnings,
  };
}
