import { Card } from "@/components/ui/card";
import { areaPath } from "@/lib/areas/tree";
import { formatDateTime } from "@/lib/format";
import type { TicketDetail } from "@/lib/tickets/store";
import { canCategorize, CATEGORY_LABELS, DEVICE_LABELS, NO_CATEGORY, type Actor, type DeviceType, type SeverityValue } from "@/lib/tickets/workflow";
import type { ticketFormOptions } from "@/lib/tickets/form-options";
import { LevelLabel } from "@/components/ticket-badges";
import { AssignControl } from "../_controls/assign-control";
import { CategoryControl } from "../_controls/category-control";
import { Evidence } from "@/components/conversation/conversation";
import { Detail, DetailGroup, FootFact, Unset } from "./detail-parts";

/** One card holds the ticket's Details and its Report, one after the other. */
export function DetailsCard({
  t,
  me,
  assignable,
  options,
}: {
  t: TicketDetail;
  me: Actor;
  assignable: boolean;
  options: Awaited<ReturnType<typeof ticketFormOptions>> | null;
}) {
  const ref = { id: t.id, number: t.number };
  return (
    <Card className="desk:min-h-0 desk:flex-1 desk:overflow-y-auto desk:overscroll-contain">
      <section aria-labelledby="details-title">
        <h2
          id="details-title"
          className="px-5 pt-5 text-lg font-semibold"
        >
          Details
        </h2>
        {/* A spec sheet: fields grouped under small headings, in columns that share the card's width. No boxes
          inside the card. Status isn't repeated here; it is in the title row. */}
        <div className="grid gap-x-10 gap-y-6 px-5 pt-4 pb-5 sm:grid-cols-2 lg:grid-cols-3">
          <DetailGroup title="Assignment">
            {assignable && options ? (
              <Detail label="Developer" control>
                <AssignControl
                  ticket={ref}
                  areas={options.areas}
                  people={options.people}
                  areaId={t.areaId ?? ""}
                  assigneeId={t.assigneeId ?? ""}
                  assigneeName={t.assignee?.name ?? null}
                />
              </Detail>
            ) : (
              <Detail label="Developer">
                {t.assignee?.name ?? <Unset>Not assigned</Unset>}
              </Detail>
            )}
            <Detail label="Module">
              {t.area ? (
                areaPath(t.area)
              ) : (
                <Unset>Module not set</Unset>
              )}
            </Detail>
          </DetailGroup>
          <DetailGroup title="Classification">
            <Detail
              label="Category"
              tip="Chosen when the ticket is filed. The developer can correct it once they identify the bug. Module progress on the Dashboard counts by category."
              control={canCategorize(t, me)}
            >
              {canCategorize(t, me) ? (
                <CategoryControl
                  ticket={ref}
                  category={t.category}
                />
              ) : t.category ? (
                CATEGORY_LABELS[t.category]
              ) : (
                <Unset>{NO_CATEGORY}</Unset>
              )}
            </Detail>
            {t.severity ? (
              <Detail label="Severity">
                <LevelLabel value={t.severity as SeverityValue} />
              </Detail>
            ) : null}
            <Detail label="Priority">
              <LevelLabel value={t.priority} />
            </Detail>
          </DetailGroup>
          <DetailGroup title="Environment">
            <Detail label="Found in">
              {t.foundIn || <Unset>Not set</Unset>}
            </Detail>
            <Detail label="Device type">
              {t.deviceType ? (
                DEVICE_LABELS[t.deviceType as DeviceType]
              ) : (
                <Unset>Not set</Unset>
              )}
            </Detail>
          </DetailGroup>
        </div>
        {/* Who filed it and when, as one quiet line under the fields. */}
        <dl className="flex flex-wrap gap-x-6 gap-y-1.5 border-t border-line2 bg-surface2 px-5 py-3 text-[0.8438rem]">
          <FootFact label="Reported by">
            {t.reporter.name}
          </FootFact>
          <FootFact label="Filed">
            {formatDateTime(t.createdAt)}
          </FootFact>
          {t.closedAt ? (
            <FootFact label="Closed">
              {formatDateTime(t.closedAt)}
            </FootFact>
          ) : null}
        </dl>
      </section>
      <section
        aria-labelledby="report-title"
        className="border-t border-line px-5 pt-5 pb-5"
      >
        <h2 id="report-title" className="text-lg font-semibold">
          Report
        </h2>
        {t.description ? (
          <p className="mt-2.5 max-w-[72ch] text-[0.9375rem] leading-[1.6] wrap-anywhere whitespace-pre-wrap text-ink2">
            {t.description}
          </p>
        ) : null}
        <Evidence files={t.attachments} />
      </section>
    </Card>
  );
}
