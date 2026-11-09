"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckIcon, FileSpreadsheetIcon, PrinterIcon, RefreshCwIcon, SaveIcon, UserPenIcon } from "lucide-react";
import { Field, FormMessage } from "@/components/form-field";
import { SelectField } from "@/components/select-field";
import { InlineAlert } from "@/components/inline-alert";
import { Button } from "@/components/ui/button";
import { attendedCount, isOffStatus, type DarDays, type DayStatus } from "@/lib/dar/attendance";
import { NO_ENTRY, REST_DAY, type DarCells } from "@/lib/dar/autofill";
import { darHtml, PRINT_PAGE, PRINT_PAPER } from "@/lib/dar/html";
import type { DarReportData } from "@/lib/dar/store";
import { isEmptySetup } from "@/lib/dar/template";
import { initialFormState, type FormState } from "@/lib/form";
import { cn } from "@/lib/utils";
import { refillDar, saveDar } from "./actions";
import { DarSheet } from "./dar-sheet";
import { PasteAttendance } from "./paste-attendance";

type PeriodOption = { start: string; label: string; saved: boolean };

export function DarEditor({
  report,
  periods,
  hasFullName,
  accountName,
  needsFirstPeriod,
}: {
  report: DarReportData;
  periods: PeriodOption[];
  hasFullName: boolean;
  accountName: string;
  /** They haven't chosen their first period and have saved nothing, so only the current period is listed. */
  needsFirstPeriod: boolean;
}) {
  const router = useRouter();
  const [cells, setCells] = useState<DarCells>(report.cells);
  const [dateSubmitted, setDateSubmitted] = useState(report.dateSubmitted);
  const [status, setStatus] = useState<DarDays>(report.status);
  const [dirty, setDirty] = useState(false);
  const [note, setNote] = useState<FormState | null>(null);
  const [busy, startTransition] = useTransition();
  const [downloading, setDownloading] = useState(false);

  // Days Attended counts the Present days (on-site), not cells with text.
  const attended = attendedCount(status);
  const period = report.period.start;
  const h = report.header;
  const empty = isEmptySetup(h);

  // Unsaved edits are lost on leaving; let the browser ask first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function setCell(section: keyof DarCells, row: number, day: number, value: string) {
    setCells((c) => ({ ...c, [section]: c[section].map((r, i) => (i === row ? r.map((v, j) => (j === day ? value : v)) : r)) }));
    setDirty(true);
  }

  /**
   * A day's status changed: a day turning into a day off swaps its untouched "-" cells for REST DAY, and back. Cells with
   * anything else written in them are left alone.
   */
  function changeDays(next: DarDays) {
    const idx = report.days.map((d) => d.date);
    setCells((c) => {
      const swap = (rows: string[][]) =>
        rows.map((r) =>
          r.map((v, j) => {
            const before = status[idx[j]]?.status;
            const after = next[idx[j]]?.status;
            if (!before || !after || isOffStatus(before) === isOffStatus(after)) return v;
            if (isOffStatus(after) && v.trim() === NO_ENTRY) return REST_DAY;
            if (!isOffStatus(after) && v.trim() === REST_DAY) return NO_ENTRY;
            return v;
          }),
        );
      return { core: swap(c.core), support: swap(c.support) };
    });
    setStatus(next);
    setDirty(true);
  }

  function setDayStatus(date: string, s: DayStatus) {
    changeDays({ ...status, [date]: { ...status[date], status: s } });
  }

  async function save(): Promise<boolean> {
    const fd = new FormData();
    fd.set("period", period);
    fd.set("cells", JSON.stringify(cells));
    fd.set("dateSubmitted", dateSubmitted);
    fd.set("status", JSON.stringify(status));
    // What QA Hub wrote from ticket work when this page loaded, so the next update replaces it instead of adding it twice.
    fd.set("auto", JSON.stringify(report.auto));
    const r = await saveDar(initialFormState, fd);
    setNote(r);
    if (r.ok) {
      setDirty(false);
      router.refresh();
    }
    return r.ok;
  }

  function refill() {
    if (dirty && !window.confirm("Add your latest ticket work now? Unsaved changes on this page are lost; save first to keep them.")) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("period", period);
      const r = await refillDar(initialFormState, fd);
      setNote(r);
      if (r.ok && r.cells) {
        setCells(r.cells);
        setDirty(false);
        router.refresh();
      }
    });
  }

  async function download() {
    setDownloading(true);
    try {
      if (dirty && !(await save())) return;
      const res = await fetch(`/dar/export?period=${period}&format=xlsx`);
      if (!res.ok) {
        setNote({ ok: false, message: (await res.text()) || "The download failed. Try again." });
        return;
      }
      const name = decodeURIComponent(/filename\*=UTF-8''([^;]+)/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "DAR.xlsx");
      const url = URL.createObjectURL(await res.blob());
      const a = Object.assign(document.createElement("a"), { href: url, download: name });
      document.body.append(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  /** Prints the sheet as it is now (saved or not) on one landscape long bond (8.5 × 13 in) page. Save as PDF from the print dialog. */
  function print() {
    const html = darHtml({ ...report, cells, dateSubmitted, daysAttended: attended }, { seal: `${location.origin}/dcwd-seal.png`, title: `DAR ${report.period.start}` });
    const frame = document.createElement("iframe");
    Object.assign(frame.style, { position: "fixed", left: "-10000px", top: "0", width: `${PRINT_PAPER.width}px`, height: `${PRINT_PAPER.height}px`, border: "0" });
    frame.setAttribute("aria-hidden", "true");
    frame.onload = () => {
      const doc = frame.contentDocument;
      const win = frame.contentWindow;
      if (!doc || !win) return frame.remove();
      const go = () => {
        // Shrink the sheet (not the margins) to fit inside them on one page, like the paper form.
        const zoom = Math.min(1, (PRINT_PAGE.height - 4) / doc.body.scrollHeight);
        if (zoom < 1) doc.body.style.zoom = String(zoom);
        win.addEventListener("afterprint", () => frame.remove());
        win.focus();
        win.print();
      };
      const seal = doc.querySelector("img");
      if (seal && !seal.complete) seal.onload = seal.onerror = go;
      else go();
    };
    frame.srcdoc = html;
    document.body.append(frame);
  }

  return (
    <div className="grid gap-5">
      {!hasFullName && !empty ? (
        <InlineAlert tone="warn">
          Your report shows your QA Hub nickname, <strong>{accountName}</strong>. Add your full name as it appears on official forms under{" "}
          <Link href="/dar/setup" className="font-semibold underline underline-offset-2">
            My details
          </Link>
          .
        </InlineAlert>
      ) : null}
      {needsFirstPeriod && !empty ? (
        <InlineAlert tone="info">
          Choose the first period of your DAR under{" "}
          <Link href="/dar/setup" className="font-semibold underline underline-offset-2">
            My details
          </Link>
          , and your list of periods will start from it.
        </InlineAlert>
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-4">
          <Field label="Period" htmlFor="period" className="w-72">
            <SelectField
              id="period"
              value={period}
              onValueChange={(v) => {
                if (dirty && !window.confirm("You have unsaved changes. Leave this period without saving?")) return;
                setDirty(false);
                router.push(`/dar?period=${v}`);
              }}
              options={periods.map((p) => ({ value: p.start, label: `${p.label}${p.saved ? " · saved" : ""}` }))}
            />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" nativeButton={false} render={<Link href="/dar/setup" />}>
            <UserPenIcon /> My details
          </Button>
          {empty ? null : (
            <>
              <Button variant="outline" onClick={refill} disabled={busy}>
                <RefreshCwIcon className={cn(busy && "animate-spin")} /> Add latest ticket work
              </Button>
              <Button variant="outline" onClick={() => startTransition(async () => void (await save()))} disabled={busy || !dirty}>
                {dirty ? <SaveIcon /> : <CheckIcon />} {dirty ? "Save" : report.saved || note?.ok ? "Saved" : "Save"}
              </Button>
              <PasteAttendance status={status} workDays={report.workDays} onApply={changeDays} />
              <Button variant="outline" onClick={print}>
                <PrinterIcon /> Print
              </Button>
              <Button onClick={download} disabled={downloading}>
                <FileSpreadsheetIcon /> {downloading ? "Preparing…" : "Excel"}
              </Button>
            </>
          )}
        </div>
      </div>

      {note && !note.ok ? <FormMessage state={note} /> : null}
      {note?.ok && note.message !== "Saved." ? (
        <p role="status" className="text-[0.8125rem] text-muted-foreground">
          {note.message}
        </p>
      ) : null}

      {empty ? (
        <div className="grid justify-items-start gap-3 rounded-[0.75rem] border border-dashed border-line2 bg-card px-5 py-6">
          <h2 className="text-base font-semibold">Set up your DAR</h2>
          <p className="max-w-prose text-sm text-ink2">
            Add your full name, position, office, who confirms and notes your report, and your core and support duties. You do this once; it&apos;s used
            for every period after, and you can change it anytime under <strong>My details</strong>.
          </p>
          <Button nativeButton={false} render={<Link href="/dar/setup" />}>
            <UserPenIcon /> Set up my DAR
          </Button>
        </div>
      ) : (
        <>
          <DarSheet
            report={report}
            cells={cells}
            dateSubmitted={dateSubmitted}
            daysAttended={attended}
            status={status}
            onStatus={setDayStatus}
            onCell={setCell}
            onDateSubmitted={(d) => {
              setDateSubmitted(d);
              setDirty(true);
            }}
          />
          <p className="-mt-2 text-[0.7813rem] text-muted-foreground">
            Click any day to type in it. Rows marked <span className="font-medium text-primary-text">↻ from my ticket work</span> fill in by themselves from the tickets you filed,
            replied to or moved, one entry per ticket; work outside your work hours (My account) is marked &ldquo;After hours&rdquo;. What you type is never replaced. A work day
            with nothing is &ldquo;-&rdquo;, a day off {REST_DAY}. Each day&apos;s status under its date sets Days Attended (Present days); use Paste attendance to fill them
            from the ERP. Click the date submitted to change it.
          </p>
        </>
      )}
    </div>
  );
}
