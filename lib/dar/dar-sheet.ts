// Reads one sheet of a DAR workbook: the DCWD DAR form. The form is found by its labels, not fixed cells, because
// sheets drift ("Name of JOE" in column A or B, 15 or 16 day columns, a typo in a date). Dates come from the first date
// in the core functions' header row, one day per column.

import { CELL_MAX } from "./autofill";
import { addDays } from "./period";
import type { DarFunction, Signatory } from "./template";
import type { Grid, WorkbookSheet } from "./workbook";

export type ImportedRow = { fn: DarFunction; /** The day's entry by date ("2026-10-18"). */ days: Record<string, string> };
export type ImportedSheet = {
  name: string;
  fullName: string;
  position: string;
  department: string;
  unit: string;
  supervisor: string;
  confirmedBy: Signatory;
  notedBy: Signatory;
  dateSubmitted: string | null;
  /** Every day column's date, in order. */
  dates: string[];
  core: ImportedRow[];
  support: ImportedRow[];
};

/** Spaces tidied, line breaks kept. */
export const clean = (s: string) =>
  s
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/[ \t ]+/g, " ").trim())
    .join("\n")
    .trim();
/** For matching: lower case, single spaces, no punctuation at the ends. */
export const key = (s: string) => clean(s).toLowerCase().replace(/\s+/g, " ").replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "");

/** A day cell's entry: the form's dashes and "n/a" mean nothing was done that day. */
const entry = (s: string | undefined) => {
  const v = clean(s ?? "");
  return /^([-–—_.]+|n\/?a)$/i.test(v) ? "" : v;
};

/** An Excel date number (1900 date system) as "YYYY-MM-DD", or null. Only plausible DAR years count. */
export function excelDate(v: string | undefined): string | null {
  if (!v || !/^\d+(\.\d+)?$/.test(v.trim())) return null;
  const n = Math.floor(Number(v));
  if (n < 36526 || n > 73051) return null; // 2000-01-01 to 2099-12-31
  return addDays("1970-01-01", n - 25569);
}

const DOW = /^(sun|mon|tue|wed|thu|fri|sat)[a-z]*\.?$/i;
const SIGN_LABEL = /^(prepared|reviewed|confirmed|approved|noted|certified)\s+by\b/i;

function cellsOf(grid: Grid, row: number): [number, string][] {
  return [...(grid.get(row) ?? new Map<number, string>()).entries()].sort((a, b) => a[0] - b[0]);
}

/** Where a label is on the sheet ("Name of JOE :"), and the value written to its right. */
function labelled(grid: Grid, test: RegExp): { row: number; col: number; value: string } | null {
  for (const row of [...grid.keys()].sort((a, b) => a - b)) {
    const cells = cellsOf(grid, row);
    const i = cells.findIndex(([, v]) => test.test(clean(v).replace(/[\s:]+$/, "")));
    if (i < 0) continue;
    const value = cells.slice(i + 1).map(([, v]) => clean(v).replace(/^:\s*/, "")).find((v) => v && v !== ":") ?? "";
    return { row, col: cells[i][0], value };
  }
  return null;
}

/** The name and title under a signature label: the first two lines of text below it. */
function signatory(grid: Grid, test: RegExp): Signatory {
  const at = labelled(grid, test);
  if (!at) return { name: "", title: "" };
  const below: string[] = [];
  const last = Math.max(...grid.keys());
  for (let r = at.row + 1; r <= Math.min(last, at.row + 12) && below.length < 2; r++) {
    const v = cellsOf(grid, r).find(([c]) => c >= at.col && c <= at.col + 4)?.[1];
    if (v && !SIGN_LABEL.test(clean(v))) below.push(clean(v));
  }
  return { name: below[0] ?? "", title: below[1] ?? "" };
}

/** Reads one sheet, or null when it isn't a DAR form (no core functions with dates). */
export function parseDarSheet(sheet: WorkbookSheet): ImportedSheet | null {
  const { grid } = sheet;
  const rows = [...grid.keys()].sort((a, b) => a - b);
  const find = (test: RegExp) => {
    for (const r of rows) for (const [c, v] of cellsOf(grid, r)) if (test.test(clean(v))) return { row: r, col: c };
    return null;
  };
  const core = find(/core\s+functions?/i);
  if (!core) return null;
  const support = find(/support\s+functions?/i);
  const mfoCol = cellsOf(grid, core.row).find(([, v]) => /major\s+final\s+output|mfo/i.test(v))?.[0] ?? core.col + 6;

  // The day columns: from the first date in the core header row, one day per column, while the header row or the
  // weekday row under it still has something there.
  const headerCells = cellsOf(grid, core.row).filter(([c]) => c > mfoCol);
  const firstDated = headerCells.find(([, v]) => excelDate(v));
  if (!firstDated) return null;
  const firstCol = firstDated[0];
  const firstDate = excelDate(firstDated[1])!;
  const dowRow = grid.get(core.row + 1);
  const dates: string[] = [];
  for (let c = firstCol; c < firstCol + 31; c++) {
    const head = grid.get(core.row)?.get(c);
    const dow = dowRow?.get(c);
    if (!(head && excelDate(head)) && !(dow && DOW.test(clean(dow)))) break;
    dates.push(addDays(firstDate, c - firstCol));
  }

  const signRow = find(SIGN_LABEL)?.row ?? (rows.at(-1) ?? 0) + 1;
  const section = (from: number, to: number): ImportedRow[] => {
    const out: ImportedRow[] = [];
    for (const r of rows) {
      if (r <= from || r >= to) continue;
      const cells = cellsOf(grid, r);
      const left = cells.filter(([c]) => c < firstCol);
      // The weekday row under a section header.
      if (!left.length && cells.some(([, v]) => DOW.test(clean(v)))) continue;
      const beforeMfo = left.filter(([c]) => c < mfoCol);
      const numbered = beforeMfo.find(([, v]) => /^\d+(\.0+)?\.?$/.test(clean(v)));
      const duty = clean(beforeMfo.filter((x) => x !== numbered).map(([, v]) => v).join("\n"));
      const mfo = clean(left.filter(([c]) => c >= mfoCol).map(([, v]) => v).join("\n"));
      const days: Record<string, string> = {};
      dates.forEach((d, i) => {
        const v = entry(grid.get(r)?.get(firstCol + i));
        if (v) days[d] = v.slice(0, CELL_MAX);
      });
      if (!duty && !mfo && !Object.keys(days).length) continue;
      // A row with no number and no duty is another MFO of the duty above, as the form merges the duty cell.
      const continues = !duty && !numbered && out.length > 0;
      out.push({ fn: { duty: continues ? "" : (duty || mfo).slice(0, 1000), mfo: mfo.slice(0, 1000), autofill: false, ...(continues ? { continues: true } : {}) }, days });
    }
    return out;
  };

  const supervisor = labelled(grid, /^immediate\s+supervisor/i)?.value ?? "";
  const reviewed = signatory(grid, /^(reviewed|confirmed)\s+by/i);
  // The supervisor's name as typed in the header (not in capitals, as signature lines often are), when it's the same person.
  const same = (a: string, b: string) => a.replace(/[^a-z]/gi, "").toLowerCase() === b.replace(/[^a-z]/gi, "").toLowerCase();
  return {
    name: sheet.name,
    fullName: labelled(grid, /^name\s+of\b|^name$/i)?.value ?? "",
    position: labelled(grid, /^position(\s+title)?$/i)?.value ?? "",
    department: labelled(grid, /^department$/i)?.value ?? "",
    unit: labelled(grid, /^unit$/i)?.value ?? "",
    supervisor,
    confirmedBy: { name: supervisor && same(supervisor, reviewed.name) ? supervisor : reviewed.name || supervisor, title: reviewed.title },
    notedBy: signatory(grid, /^(approved|noted)\s+by/i),
    dateSubmitted: excelDate(labelled(grid, /date\s+submitted/i)?.value),
    dates,
    core: section(core.row, support?.row ?? signRow),
    support: support ? section(support.row, signRow) : [],
  };
}
