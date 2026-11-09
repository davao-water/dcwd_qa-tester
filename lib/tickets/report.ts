import { rootOf } from "@/lib/areas/tree";
import { formatDateTime } from "@/lib/format";
import { moduleProgress, progressTone, type ModuleProgress, type ProgressArea, type ProgressTicket } from "./progress";
import { CATEGORY_LABELS, TICKET_CATEGORIES, type TicketStatus } from "./workflow";

// The module report: every active top-level module's progress (the same numbers as the Dashboard's module cards) and how
// many of its tickets sit at each stage, as a page to print or save as PDF. Only numbers and module names: no ticket text.

export const REPORT_STAGES = [
  { key: "toStart", label: "Not started", statuses: ["NEW", "REOPENED"] },
  { key: "doing", label: "In progress", statuses: ["IN_PROGRESS"] },
  { key: "info", label: "Needs info", statuses: ["NEED_INFO"] },
  // Tickets already Verified (no longer a step of its own) wait for QA to close, like Fixed ones.
  { key: "fixed", label: "Fixed", statuses: ["FIXED", "VERIFIED"] },
  { key: "closed", label: "Closed", statuses: ["CLOSED"] },
  { key: "other", label: "Rejected, duplicate or won't fix", statuses: ["REJECTED", "DUPLICATE", "WONT_FIX"] },
] as const satisfies readonly { key: string; label: string; statuses: readonly TicketStatus[] }[];

export type StageKey = (typeof REPORT_STAGES)[number]["key"];
export type StageCounts = Record<StageKey, number> & { total: number };

export type ReportRow = ModuleProgress & { stages: StageCounts };
export type ModuleReport = {
  rows: ReportRow[];
  /** Tickets with no module, or in a module that was switched off: counted by stage only. */
  elsewhere: StageCounts;
  all: StageCounts;
  /** Closed ÷ counted over every active module's tagged tickets (plain, not the per-module fair score). */
  overall: { done: number; total: number; pct: number };
};

const emptyStages = (): StageCounts => ({ toStart: 0, doing: 0, info: 0, fixed: 0, closed: 0, other: 0, total: 0 });

const stageOf = (s: TicketStatus): StageKey => REPORT_STAGES.find((st) => (st.statuses as readonly TicketStatus[]).includes(s))!.key;

function add(c: StageCounts, s: TicketStatus) {
  c[stageOf(s)]++;
  c.total++;
}

export function moduleReport(areas: ProgressArea[], tickets: ProgressTicket[]): ModuleReport {
  const cards = moduleProgress(areas, tickets);
  const topOf = new Map(areas.map((a) => [a.id, rootOf(areas, a.id)]));
  const stages = new Map(cards.map((c) => [c.id, emptyStages()]));
  const elsewhere = emptyStages();
  const all = emptyStages();
  for (const t of tickets) {
    add(all, t.status);
    const top = t.areaId ? topOf.get(t.areaId) : undefined;
    add((top && stages.get(top)) || elsewhere, t.status);
  }
  const done = cards.reduce((n, c) => n + c.score.done, 0);
  const total = cards.reduce((n, c) => n + c.score.total, 0);
  return {
    rows: cards.map((c) => ({ ...c, stages: stages.get(c.id)! })),
    elsewhere,
    all,
    overall: { done, total, pct: total ? Math.floor((done * 100) / total) : 0 },
  };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

const TONE_COLOR: Record<ReturnType<typeof progressTone>, string> = { none: "#8a8fa3", low: "#c62828", mid: "#b7791f", good: "#2457c5", done: "#1e7d45" };

function bar(pct: number) {
  return `<span class="bar"><span style="width:${pct}%;background:${TONE_COLOR[progressTone(pct)]}"></span></span>`;
}

/** The report as a standalone page: A4 landscape, a Print / Save as PDF button that doesn't print. */
export function reportHtml(r: ModuleReport, meta: { generatedAt: Date; by: string }): string {
  const cat = (row: ReportRow, c: (typeof TICKET_CATEGORIES)[number]) => {
    const p = row.categories[c];
    return p.total ? `${p.pct}%<small>${p.done}/${p.total}</small>` : `<span class="muted">–</span>`;
  };
  const stageCells = (s: StageCounts) => REPORT_STAGES.map((st) => `<td class="num">${s[st.key] || '<span class="muted">0</span>'}</td>`).join("") + `<td class="num strong">${s.total}</td>`;
  const rows = r.rows
    .map(
      (row) => `<tr>
  <th scope="row">${esc(row.name)}</th>
  <td class="score"><b style="color:${TONE_COLOR[progressTone(row.score.pct)]}">${row.score.pct}%</b>${bar(row.score.pct)}<small>${row.score.done} of ${row.score.total} closed</small></td>
  ${TICKET_CATEGORIES.map((c) => `<td class="num">${cat(row, c)}</td>`).join("")}
  <td class="num">${row.untagged || '<span class="muted">0</span>'}</td>
  ${stageCells(row.stages)}
</tr>`,
    )
    .join("\n");
  const elsewhere = r.elsewhere.total
    ? `<tr class="soft"><th scope="row">No module or inactive module</th><td class="muted" colspan="${TICKET_CATEGORIES.length + 2}">Not scored</td>${stageCells(r.elsewhere)}</tr>`
    : "";
  const open = r.all.total - r.all.closed - r.all.other;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Module progress report – ${esc(formatDateTime(meta.generatedAt))}</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 24px; font: 13px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #1c1f2e; background: #fff; }
  header { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 12px; align-items: flex-end; margin-bottom: 16px; }
  h1 { margin: 0; font-size: 20px; }
  .sub { margin: 4px 0 0; color: #5b6075; }
  button { font: inherit; font-weight: 600; padding: 9px 16px; border-radius: 8px; border: 0; background: #3f4fd6; color: #fff; cursor: pointer; }
  .stats { display: flex; flex-wrap: wrap; gap: 10px; margin: 0 0 16px; padding: 0; list-style: none; }
  .stats li { border: 1px solid #e3e5ee; border-radius: 8px; padding: 8px 14px; min-width: 120px; }
  .stats b { display: block; font-size: 18px; }
  .stats span { color: #5b6075; font-size: 12px; }
  .wrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 7px 8px; border-bottom: 1px solid #e3e5ee; text-align: left; vertical-align: middle; }
  thead th { background: #f1f2f8; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: #2b3258; }
  thead tr.group th { background: #fff; border-bottom: 0; color: #5b6075; text-align: center; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .strong { font-weight: 700; }
  small { display: block; color: #5b6075; font-size: 11px; }
  .muted { color: #9aa0b4; }
  .score { min-width: 130px; }
  .score b { font-size: 15px; }
  .bar { display: block; height: 6px; margin: 3px 0; border-radius: 3px; background: #eceef5; overflow: hidden; }
  .bar span { display: block; height: 100%; }
  tr.soft th, tr.soft td { color: #5b6075; }
  tfoot th, tfoot td { border-top: 2px solid #c9ccd9; font-weight: 700; }
  .note { margin-top: 14px; color: #5b6075; font-size: 11.5px; max-width: 110ch; }
  tr { break-inside: avoid; }
  @media print {
    body { padding: 0; }
    .no-print { display: none; }
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
<header>
  <div>
    <h1>QA Hub – Module progress report</h1>
    <p class="sub">Generated ${esc(formatDateTime(meta.generatedAt))} by ${esc(meta.by)}. Every ticket from every QA tester.</p>
  </div>
  <button type="button" class="no-print" onclick="window.print()">Print / Save as PDF</button>
</header>
<ul class="stats">
  <li><b>${r.all.total}</b><span>Tickets in all</span></li>
  <li><b>${open}</b><span>Still open</span></li>
  <li><b>${r.all.closed}</b><span>Closed</span></li>
  <li><b>${r.overall.pct}%</b><span>Closed across modules (${r.overall.done} of ${r.overall.total})</span></li>
</ul>
<div class="wrap">
<table>
  <thead>
    <tr class="group"><th></th><th></th><th colspan="${TICKET_CATEGORIES.length + 1}">Closed by category</th><th colspan="${REPORT_STAGES.length + 1}">Tickets by stage</th></tr>
    <tr>
      <th scope="col">Module</th>
      <th scope="col">Score</th>
      ${TICKET_CATEGORIES.map((c) => `<th scope="col" class="num">${esc(CATEGORY_LABELS[c])}</th>`).join("")}
      <th scope="col" class="num">Not tagged</th>
      ${REPORT_STAGES.map((st) => `<th scope="col" class="num">${esc(st.label)}</th>`).join("")}
      <th scope="col" class="num">Total</th>
    </tr>
  </thead>
  <tbody>
${rows || `<tr><td colspan="${TICKET_CATEGORIES.length + REPORT_STAGES.length + 4}" class="muted">No active modules yet.</td></tr>`}
${elsewhere}
  </tbody>
  <tfoot>
    <tr><th scope="row">All tickets</th><td colspan="${TICKET_CATEGORIES.length + 2}"></td>${stageCells(r.all)}</tr>
  </tfoot>
</table>
</div>
<p class="note">Score: closed tickets out of the module's tagged tickets, counted as at least 5 so a module with very few tickets can't score 100% too early (the same score as the Dashboard). Rejected, duplicate and won't-fix tickets, and tickets closed by their reporter before work started, are left out of the scores but still listed by stage.</p>
</body>
</html>`;
}
