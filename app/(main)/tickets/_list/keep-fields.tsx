import type { TicketFilters } from "@/lib/schemas/ticket";

/** The view the list is in (list or board, stage, reporter) rides along when the filters are applied. */
export function KeepFields({ f, showQa }: { f: TicketFilters; showQa: boolean }) {
  return (
    <>
      {f.view ? <input type="hidden" name="view" value={f.view} /> : null}
      {f.group !== "open" ? (
        <input type="hidden" name="group" value={f.group} />
      ) : null}
      {/* "Reported by me" is a tab where the QA tester filter isn't shown: it rides along. */}
      {f.reporter && !showQa ? <input type="hidden" name="reporter" value={f.reporter} /> : null}
    </>
  );
}
