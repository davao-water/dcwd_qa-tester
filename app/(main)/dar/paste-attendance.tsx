"use client";

import { useState } from "react";
import { ClipboardPasteIcon } from "lucide-react";
import { FormDialog } from "@/components/form-dialog";
import { InlineAlert } from "@/components/inline-alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { applyAttendance, DAY_STATUS_LABELS, parseAttendance, type DarDays } from "@/lib/dar/attendance";
import { longDate } from "@/lib/dar/period";

/** Where to copy the log from: the ERP's own attendance page. */
export const ERP_ATTENDANCE_URL = "https://myportal.davao-water.gov.ph/apps/hr/attendance/log-inquiry";

/**
 * Paste the rows copied from the ERP's log inquiry; QA Hub reads each day's first time-in and last time-out and sets the
 * day statuses. Read here in the browser; only the statuses and times are kept, once the DAR is saved.
 */
export function PasteAttendance({ status, workDays, onApply }: { status: DarDays; workDays: number; onApply: (days: DarDays) => void }) {
  return (
    <FormDialog
      wide
      title="Paste attendance"
      description="Copy your rows from the ERP's attendance log inquiry and paste them here. Each day gets its first time-in and last time-out."
      trigger={
        <Button variant="outline">
          <ClipboardPasteIcon /> Paste attendance
        </Button>
      }
    >
      {(close) => <PasteForm status={status} workDays={workDays} onApply={(d) => (onApply(d), close())} />}
    </FormDialog>
  );
}

function PasteForm({ status, workDays, onApply }: { status: DarDays; workDays: number; onApply: (days: DarDays) => void }) {
  const [text, setText] = useState("");
  const logs = text.trim() ? parseAttendance(text) : [];
  const plan = logs.length ? applyAttendance(status, logs, workDays) : null;
  const changed = plan ? Object.keys(plan.days).filter((d) => plan.days[d].status !== status[d]?.status || plan.days[d].in !== status[d]?.in || plan.days[d].out !== status[d]?.out) : [];

  return (
    <div className="grid gap-4">
      <p className="text-[0.8125rem] text-muted-foreground">
        Open{" "}
        <a href={ERP_ATTENDANCE_URL} target="_blank" rel="noopener" className="font-medium text-primary-text underline underline-offset-2">
          your attendance log in the ERP
        </a>
        , pick this period, select the rows (Ctrl+A is fine) and copy. Names and employee numbers in the paste are ignored and not saved.
      </p>
      <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={7} placeholder="Paste here (Ctrl+V)" aria-label="Pasted attendance log" className="font-mono text-[0.8125rem]" />

      {text.trim() && !logs.length ? (
        <InlineAlert tone="warn">No attendance found in that. Copy the rows of the log inquiry table, with their dates and times.</InlineAlert>
      ) : null}

      {plan ? (
        <div className="grid gap-2.5">
          <p className="text-sm">
            <strong>{plan.present.length}</strong> day{plan.present.length === 1 ? "" : "s"} present in this period
            {plan.noLog.length ? (
              <>
                , <strong>{plan.noLog.length}</strong> work day{plan.noLog.length === 1 ? "" : "s"} with no time-in (set to Absent; change any to Leave or Remote on the sheet)
              </>
            ) : null}
            {plan.outside ? `. ${plan.outside} logged day${plan.outside === 1 ? " is" : "s are"} outside this period and left out` : ""}.
          </p>
          <div className="max-h-64 overflow-y-auto rounded-[0.625rem] border border-line">
            <table className="w-full text-[0.8125rem]">
              <thead className="sticky top-0 bg-table-head text-left text-[0.75rem] uppercase text-navy">
                <tr>
                  <th className="px-3 py-2">Day</th>
                  <th className="px-3 py-2">In</th>
                  <th className="px-3 py-2">Out</th>
                  <th className="px-3 py-2">Where</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(plan.days).map(([date, d]) => (
                  <tr key={date} className="border-t border-line2">
                    <td className="px-3 py-1.5">{longDate(date)}</td>
                    <td className="px-3 py-1.5 font-mono">{d.in ?? "—"}</td>
                    <td className="px-3 py-1.5 font-mono">{d.out ?? "—"}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">{d.where ?? ""}</td>
                    <td className={plan.noLog.includes(date) ? "px-3 py-1.5 font-medium text-warn-ink" : "px-3 py-1.5"}>{DAY_STATUS_LABELS[d.status]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div className="flex justify-end">
        <Button type="button" disabled={!plan || !changed.length} onClick={() => plan && onApply(plan.days)}>
          {plan && changed.length ? `Apply to ${changed.length} day${changed.length === 1 ? "" : "s"}` : "Apply"}
        </Button>
      </div>
    </div>
  );
}
