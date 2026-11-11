import { StatusPill } from "@/components/status-pill";
import { Card } from "@/components/ui/card";
import { formatDateTime, timeAgo } from "@/lib/format";

export type RequestRow = { id: string; name: string; email: string; role: string; at: Date; actions: React.ReactNode };

/** The Approval and Password reset tabs: a card with its explanation and one row per request. */
export function RequestList({ title, text, empty, rows }: { title: string; text: string; empty: string; rows: RequestRow[] }) {
  return (
    <Card role="region" aria-labelledby="requests-title" className="desk:min-h-0">
      <div className="border-b border-line2 px-5 pt-5 pb-4">
        <h2 id="requests-title" className="text-lg font-semibold">{title}</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{text}</p>
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="stagger desk:min-h-0 desk:overflow-y-auto desk:overscroll-contain">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line2 px-5 py-3 last:border-b-0">
              <span className="min-w-0 flex-[1_1_10rem] text-[0.9063rem] font-semibold">{r.name}</span>
              <span className="min-w-0 flex-[2_1_14rem] font-mono text-[0.8438rem] break-all">{r.email}</span>
              <StatusPill tone="neutral">{r.role}</StatusPill>
              <span className="w-16 text-[0.8438rem] text-muted-foreground" title={formatDateTime(r.at)}>{timeAgo(r.at)}</span>
              <span className="ml-auto">{r.actions}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
