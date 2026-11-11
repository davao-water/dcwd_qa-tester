// Reads an Excel .xlsx file in the browser: every visible sheet as text cells. Knows nothing about the DAR form.

import { strFromU8, unzipSync } from "fflate";

/** A sheet's cells as text, by row then column (both 1-based). */
export type Grid = Map<number, Map<number, string>>;
export type WorkbookSheet = { name: string; grid: Grid };

/** The biggest file read (the form is a few hundred KB; images in it add more). */
export const MAX_IMPORT_BYTES = 15 * 1024 * 1024;

export class DarImportError extends Error {}

const ENTITY: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decode = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) =>
    e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENTITY[e.toLowerCase()],
  );

const attr = (tag: string, name: string) => new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1];

/** The text of an `<si>` or `<is>`: its `<t>` runs, without phonetic hints. */
const runText = (xml: string) =>
  [...xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "").matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>|<t\b[^>]*\/>/g)].map((m) => decode(m[1] ?? "")).join("");

/** "AB" → 28. */
export function columnIndex(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

/** Every sheet of an .xlsx, in workbook order, as text cells. */
export function readWorkbook(bytes: Uint8Array): WorkbookSheet[] {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, { filter: (f) => (f.name.startsWith("xl/") && f.name.endsWith(".xml")) || f.name.endsWith(".rels") });
  } catch {
    throw new DarImportError("This isn't an Excel file QA Hub can read. Save it as .xlsx (Excel Workbook) and try again.");
  }
  const read = (name: string) => (files[name] ? strFromU8(files[name]) : null);
  const workbook = read("xl/workbook.xml");
  if (!workbook) throw new DarImportError("This isn't an Excel file QA Hub can read. Save it as .xlsx (Excel Workbook) and try again.");

  const shared = [...(read("xl/sharedStrings.xml") ?? "").matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((m) => runText(m[1]));
  const rels = new Map(
    [...(read("xl/_rels/workbook.xml.rels") ?? "").matchAll(/<Relationship\b[^>]*>/g)].map((m) => {
      const target = (attr(m[0], "Target") ?? "").replace(/^\/?xl\//, "").replace(/^\//, "");
      return [attr(m[0], "Id") ?? "", `xl/${target}`] as const;
    }),
  );

  return [...workbook.matchAll(/<sheet\b[^>]*>/g)].flatMap((m) => {
    const name = decode(attr(m[0], "name") ?? "");
    const path = rels.get(attr(m[0], "r:id") ?? "");
    const xml = path ? read(path) : null;
    if (!xml || attr(m[0], "state") === "hidden" || attr(m[0], "state") === "veryHidden") return [];
    const grid: Grid = new Map();
    for (const c of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = /^([A-Z]+)(\d+)$/.exec(attr(c[1], "r") ?? "");
      if (!ref || !c[2]) continue;
      const type = attr(c[1], "t");
      const v = /<v>([\s\S]*?)<\/v>/.exec(c[2])?.[1];
      const value = type === "s" ? (shared[Number(v)] ?? "") : type === "inlineStr" ? runText(/<is>([\s\S]*?)<\/is>/.exec(c[2])?.[1] ?? "") : decode(v ?? "");
      if (!value.trim()) continue;
      const row = Number(ref[2]);
      if (!grid.has(row)) grid.set(row, new Map());
      grid.get(row)!.set(columnIndex(ref[1]), value);
    }
    return [{ name, grid }];
  });
}
