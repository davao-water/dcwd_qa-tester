"use client";

import { useEffect, useRef, useState } from "react";
import { DatePicker } from "@/components/date-picker";
import type { DarCells } from "@/lib/dar/autofill";
import { longDate, periodLabel } from "@/lib/dar/period";
import type { DarReportData } from "@/lib/dar/store";
import { dutyLayout, type DarFunction } from "@/lib/dar/template";
import { DAY_STATUS_LABELS, PICKABLE_STATUSES, type DarDays, type DayStatus } from "@/lib/dar/attendance";
import { CELL_MAX } from "@/lib/dar/autofill";
import { cn } from "@/lib/utils";

// The DAR on screen, drawn like the DCWD paper form (same layout as lib/dar/html.ts, which makes the
// printout): a white sheet in every theme, with the day cells and the date submitted editable in place.
// The sheet keeps its paper proportions and is zoomed to fill the width of the page.

const PAPER_W = 1320;
// The DCWD workbook's own fills and colours (DAR_COLORS in lib/dar/html.ts).
const ORANGE = "bg-[#ffcc99]";
const CORE_HEAD = "bg-[#fbd4b4]";
const CELL = "border border-black px-1 py-0.5";
const FONT = { fontFamily: 'Calibri, Carlito, "Segoe UI", Arial, sans-serif' };
/** A soft fill per day status, readable on the white sheet in every theme. */
const STATUS_FILL: Record<DayStatus, string> = {
  PRESENT: "bg-[#e3f4ea]",
  REMOTE: "bg-[#e5eefc]",
  REST: "bg-[#f1f1f1]",
  HOLIDAY: "bg-[#f1f1f1]",
  LEAVE: "bg-[#fdf1d8]",
  ABSENT: "bg-[#fbe2e0]",
  UPCOMING: "bg-white",
};

export function DarSheet({
  report,
  cells,
  dateSubmitted,
  daysAttended,
  status,
  onStatus,
  onCell,
  onDateSubmitted,
}: {
  report: DarReportData;
  cells: DarCells;
  dateSubmitted: string;
  daysAttended: number;
  /** Each day's status, picked under its date (on screen only: the paper form has no row for it). */
  status: DarDays;
  onStatus: (date: string, status: DayStatus) => void;
  onCell: (section: keyof DarCells, row: number, day: number, value: string) => void;
  onDateSubmitted: (date: string) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    // Fill the width: shrink on small screens, grow on wide ones.
    const fit = () => setZoom(Math.max(0.6, Math.min(2, (el.clientWidth - 2) / PAPER_W)));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const h = report.header;
  const n = report.days.length;
  const info: [string, string][] = [
    ["Name of PBE", h.name],
    ["Position Title", h.position],
    ["Department", h.department],
    ["Unit", h.unit],
    ["Immediate Supervisor", h.supervisor],
    ["Period Covered", periodLabel(report.period)],
  ];

  const dayHeads = report.days.map((d) => (
    <th key={d.date} className={cn(CELL, ORANGE, "text-center text-[10px] leading-tight font-bold")}>
      {d.month}
      <br />
      {d.day}
      <br />
      {d.dow}
    </th>
  ));

  return (
    <div ref={wrap} className="overflow-x-auto rounded-[12px] border border-line bg-surface2 p-0">
      <div
        className="mx-auto bg-white px-8 pt-6 pb-10 text-[12px] text-black shadow-sm"
        style={{ ...FONT, width: PAPER_W, zoom }}
        aria-label="Daily Accomplishment Report"
      >
        {/* Agency banner */}
        <div className="flex items-center justify-center gap-3 border-b-[1.5px] border-black pb-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element -- a small static seal from public/ */}
          <img src="/dcwd-seal.png" alt="" className="size-12" />
          <div className="text-center leading-tight">
            <div className="text-[10px] font-bold">Republic of the Philippines</div>
            <div className="text-[12.5px] font-bold">DAVAO CITY WATER DISTRICT</div>
            <div className="text-[10px] font-bold text-[#808000]">Km 2.5 MacArthur Highway, Matina, Davao City</div>
          </div>
        </div>
        <h2 className="mt-2 mb-3 text-center text-[16px] font-bold" style={{ fontFamily: '"Book Antiqua", Palatino, "Palatino Linotype", serif' }}>
          Project-Based Employee Daily Accomplishment Report
        </h2>

        {/* Header block */}
        <div className="flex items-start justify-between gap-6">
          <div>
            <table className="border-collapse text-[11.5px]">
              <tbody>
                {info.map(([k, v]) => (
                  <tr key={k}>
                    <td className={cn(CELL, ORANGE, "w-40 px-2 font-bold")}>{k}</td>
                    <td className="w-4 border-y border-black text-center">:</td>
                    <td className={cn(CELL, "w-[440px] px-2")}>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-2.5 text-[11px] font-bold">SPECIFIC DUTIES AND RESPONSIBILITIES:</div>
            <div className="ml-44 text-[10.5px] italic">Please indicate the actual accomplishment</div>
          </div>
          <div className="grid grid-cols-[auto_auto] items-center gap-x-6 gap-y-1 text-[12px]">
            <label htmlFor="dateSubmitted" className="text-right">
              Date Submitted :
            </label>
            <DatePicker
              value={dateSubmitted}
              onChange={onDateSubmitted}
              label="Date submitted"
              trigger={
                <button
                  id="dateSubmitted"
                  type="button"
                  title="Change the date submitted"
                  className="cursor-pointer rounded-sm text-right font-bold underline decoration-dotted underline-offset-2 transition-colors hover:text-primary-text focus-visible:ring-3 focus-visible:ring-acc/25 focus-visible:outline-none"
                >
                  {longDate(dateSubmitted)}
                </button>
              }
            />
            <span className="text-right">Actual No. of Days Attended :</span>
            <span className="text-right font-bold underline tabular-nums">{daysAttended} Days</span>
          </div>
        </div>

        {/* Days grid */}
        <table className="mt-1 w-full table-fixed border-collapse">
          <colgroup>
            <col style={{ width: 22 }} />
            <col style={{ width: 230 }} />
            <col style={{ width: 210 }} />
            {report.days.map((d) => (
              <col key={d.date} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th colSpan={3} className={CELL} />
              <th colSpan={n} className={cn(CELL, "text-center text-[10px] font-bold")}>
                DAYS
              </th>
            </tr>
            <tr>
              <th colSpan={3} className={CELL} />
              {report.days.map((d, i) => (
                <th key={d.date} className={cn(CELL, "text-center text-[10px] font-bold")}>
                  {i + 1}
                </th>
              ))}
            </tr>
            {/* Each day's status and logged times: for Days Attended, not part of the paper form. */}
            <tr className="print:hidden">
              <th colSpan={3} className={cn(CELL, "bg-[#f4f5f8] px-2 text-right text-[10px] font-semibold text-[#555]")}>
                Day status · time in–out
              </th>
              {report.days.map((d) => {
                const day = status[d.date] ?? { status: "PRESENT" as DayStatus };
                return (
                  <th key={d.date} className={cn(CELL, "p-0.5 align-top font-normal", STATUS_FILL[day.status])}>
                    <select
                      aria-label={`Status of ${d.month} ${d.day}`}
                      value={day.status}
                      onChange={(e) => onStatus(d.date, e.target.value as DayStatus)}
                      className="w-full cursor-pointer rounded-sm bg-transparent text-center text-[9.5px] font-semibold text-black outline-none focus-visible:ring-2 focus-visible:ring-[#f4a46a]"
                    >
                      {[...PICKABLE_STATUSES, ...(day.status === "UPCOMING" ? (["UPCOMING"] as const) : [])].map((s) => (
                        <option key={s} value={s}>
                          {s === "REMOTE" ? "Remote" : DAY_STATUS_LABELS[s]}
                        </option>
                      ))}
                    </select>
                    {day.in || day.out ? (
                      <span className="mt-0.5 block text-[8.5px] leading-tight text-[#444]" title={day.where}>
                        {day.in ?? "—"}
                        <br />
                        {day.out ?? "—"}
                      </span>
                    ) : null}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            <SectionHead title="A.) CORE FUNCTIONS" dayHeads={dayHeads} fill={CORE_HEAD} />
            <FunctionRows section="core" label="A.) Core functions" fns={h.core} rows={cells.core} onCell={onCell} />
            <SectionHead title="B.) SUPPORT FUNCTION" dayHeads={dayHeads} />
            <FunctionRows section="support" label="B.) Support functions" fns={h.support} rows={cells.support} onCell={onCell} />
          </tbody>
        </table>

        {/* Signatories */}
        <div className="mt-8 grid grid-cols-[1.1fr_1.6fr_3fr] text-[12px]">
          {[
            ["Prepared by:", h.name, h.position],
            ["Confirmed by:", h.confirmedBy.name, h.confirmedBy.title],
            ["Noted by:", h.notedBy.name, h.notedBy.title],
          ].map(([label, name, title]) => (
            <div key={label}>
              <div className="mb-7 font-bold">{label}</div>
              <div className="font-bold">{name}</div>
              <div>{title}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function focusCell(e: React.MouseEvent<HTMLTableCellElement>) {
  const area = e.currentTarget.querySelector("textarea");
  if (area && e.target !== area) {
    e.preventDefault();
    area.focus();
    area.setSelectionRange(area.value.length, area.value.length);
  }
}

function SectionHead({ title, dayHeads, fill = ORANGE }: { title: string; dayHeads: React.ReactNode; fill?: string }) {
  return (
    <tr>
      <th colSpan={2} className={cn(CELL, fill, "py-2 text-center text-[10.5px] font-bold")}>
        {title}
      </th>
      <th className={cn(CELL, ORANGE, "text-center text-[10.5px] font-bold")}>MAJOR FINAL OUTPUT (MFOs)</th>
      {dayHeads}
    </tr>
  );
}

function FunctionRows({
  section,
  label,
  fns,
  rows,
  onCell,
}: {
  section: keyof DarCells;
  label: string;
  fns: DarFunction[];
  rows: string[][];
  onCell: (section: keyof DarCells, row: number, day: number, value: string) => void;
}) {
  // A duty with several MFOs: its number and duty cells span its rows, as on the paper form.
  const layout = dutyLayout(fns);
  return fns.map((f, i) => (
    <tr key={i}>
      {layout[i].span ? (
        <>
          <td rowSpan={layout[i].span} className={cn(CELL, "text-center text-[11px]")}>{layout[i].number}</td>
          <td rowSpan={layout[i].span} className={cn(CELL, "px-1.5 py-1 text-[11px] leading-snug whitespace-pre-line")}>
            {f.duty}
          </td>
        </>
      ) : null}
      <td className={cn(CELL, "px-1.5 py-1 text-[11px] leading-snug whitespace-pre-line")}>
        {f.mfo}
        {f.autofill ? <span className="mt-1 block text-[10px] font-medium text-[#3f4fd6] print:hidden">↻ from my ticket work</span> : null}
      </td>
      {(rows[i] ?? []).map((v, j) => (
        // A click anywhere in the cell edits it, as in a spreadsheet.
        <td key={j} className={cn(CELL, "cursor-text p-0 align-middle hover:bg-[#fff7f0]")} onMouseDown={(e) => focusCell(e)}>
          <textarea
            aria-label={`${label} row ${i + 1}, day ${j + 1}`}
            value={v}
            rows={1}
            maxLength={CELL_MAX}
            onChange={(e) => onCell(section, i, j, e.target.value)}
            className="block min-h-8 w-full resize-none bg-transparent px-0.5 py-1 text-center text-[10.5px] leading-tight text-black outline-none [field-sizing:content] focus:bg-[#fff3e8] focus:ring-2 focus:ring-[#f4a46a] focus:ring-inset"
          />
        </td>
      ))}
    </tr>
  ));
}
