"use client";

import { Field } from "@/components/form-field";
import { SelectField } from "@/components/select-field";
import type { TicketDraft } from "@/lib/tickets/draft";
import {
  CATEGORY_LABELS,
  DEVICE_LABELS,
  DEVICE_TYPES,
  foundInOptions,
  PRIORITIES,
  PRIORITY_LABELS,
  SEVERITIES,
  SEVERITY_LABELS,
  TICKET_CATEGORIES,
  type DeviceType,
  type TicketType,
} from "@/lib/tickets/workflow";
import { cn } from "@/lib/utils";
import { levelDot } from "@/components/ticket-badges";
import { AreaSelect } from "./area-select";
import { AssigneeSelect } from "./assignee-select";
import type { AreaOption, AssigneeOption, TicketValues } from "./types";

/** The ticket form's Details: module, category, where it was found, priority, developer, and for a bug severity and device. */
export function DetailsFields({
  ticket,
  d,
  err,
  areas,
  people,
  canAssign,
  type,
  areaId,
  onAreaId,
  device,
  onDevice,
  defaultDevice,
}: {
  ticket?: TicketValues;
  /** The restored draft's fields, if any. */
  d: TicketDraft["fields"] | undefined;
  err: Record<string, string[] | undefined>;
  areas: AreaOption[];
  people: AssigneeOption[];
  canAssign: boolean;
  type: TicketType;
  areaId: string;
  onAreaId: (id: string) => void;
  device: string | null;
  onDevice: (device: string) => void;
  defaultDevice: DeviceType | "";
}) {
  const foundIn = ticket?.foundIn ?? d?.foundIn ?? "";
  /** A field across both columns of New ticket's Details card. */
  const wide = !ticket ? "xl:col-span-2" : undefined;
  return (
    // Severity and Device type come last: only Bug has them, so choosing another type moves nothing above them.
    <div className={cn("grid gap-4", !ticket && "xl:min-h-0 xl:flex-1 xl:grid-cols-2 xl:content-start xl:overflow-y-auto xl:p-0.5")}>
      <Field label="Module" htmlFor="areaId" error={err.areaId} className={wide} required={!ticket} tip="Where in the ERP. It decides who is suggested for Developer.">
        <AreaSelect areas={areas} value={areaId} onChange={onAreaId} emptyLabel={ticket ? "— Not set —" : "Choose a module"} invalid={!!err.areaId} />
      </Field>
      {/* After filing, the developer corrects it in the ticket's Details, so it isn't in the edit dialog. */}
      {!ticket ? (
        <Field label="Category" htmlFor="category" error={err.category} className={wide} required tip="Front-end is what you see on screen. Back-end is data and processing. UI/UX is design work. It counts in Module progress on the Dashboard, and the developer can correct it later.">
          <SelectField id="category" name="category" defaultValue={d?.category ?? ""} aria-invalid={!!err.category} options={[{ value: "", label: "Choose a category" }, ...TICKET_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c] }))]} />
        </Field>
      ) : null}
      <Field label="Found in" htmlFor="foundIn" error={err.foundIn} tip="Optional: which environment you saw it in.">
        <SelectField id="foundIn" name="foundIn" defaultValue={foundIn} options={[{ value: "", label: "— Not set —" }, ...foundInOptions(foundIn).map((v) => ({ value: v, label: v }))]} />
      </Field>
      <Field label="Priority" htmlFor="priority" error={err.priority} required tip="How soon it should be looked at.">
        <SelectField id="priority" name="priority" defaultValue={ticket?.priority ?? d?.priority ?? "P3"} options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABELS[p], dot: levelDot(p) }))} />
      </Field>
      {!ticket && canAssign ? (
        <Field label="Developer" htmlFor="assigneeId" error={err.assigneeId} className={wide} tip="Who should fix it. You can change it later.">
          <AssigneeSelect areas={areas} people={people} areaId={areaId} defaultValue={d?.assigneeId} />
        </Field>
      ) : null}
      {type === "BUG" ? (
        <Field label="Severity" htmlFor="severity" error={err.severity} required tip="How bad the effect is: S1 blocks work or gets money wrong.">
          <SelectField id="severity" name="severity" defaultValue={ticket?.severity ?? d?.severity ?? "S3"} options={SEVERITIES.map((s) => ({ value: s, label: SEVERITY_LABELS[s], dot: levelDot(s) }))} />
        </Field>
      ) : null}
      {type === "BUG" ? (
        <Field label="Device type" htmlFor="deviceType" error={err.deviceType} tip="What the bug happened on.">
          <SelectField
            id="deviceType"
            name="deviceType"
            value={device ?? defaultDevice}
            onValueChange={onDevice}
            options={[{ value: "", label: "— Not set —" }, ...DEVICE_TYPES.map((t) => ({ value: t, label: DEVICE_LABELS[t] }))]}
          />
        </Field>
      ) : null}
    </div>
  );
}
