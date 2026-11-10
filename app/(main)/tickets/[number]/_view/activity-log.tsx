import { formatDateTime } from "@/lib/format";
import type { LogEntry } from "@/lib/tickets/log";
import { Card } from "@/components/ui/card";

/** Every movement on the ticket with its exact time, newest first. */
export function ActivityLog({ entries }: { entries: LogEntry[] }) {
  return (
    <section aria-labelledby="log-title" className="desk:min-h-0 desk:flex-1">
      <Card className="desk:h-full">
        <h2
          id="log-title"
          className="shrink-0 px-5 pt-5 pb-3 text-lg font-semibold"
        >
          Activity log
        </h2>
        <ol
          className="max-h-[26.25rem] overflow-y-auto overscroll-contain pb-2 xl:max-h-[calc(100dvh-13rem)] desk:max-h-none! desk:min-h-0 desk:flex-1"
          aria-label="Activity log, newest first"
        >
          {[...entries].reverse().map((e) => (
            <li
              key={`${e.kind}-${e.id}`}
              className="border-t border-line2 px-5 py-2.5 text-[0.8438rem] leading-[1.4]"
            >
              <strong className="font-semibold">{e.who}</strong>{" "}
              <span className="text-body2">{e.text}</span>
              {e.note ? (
                <div
                  className="mt-0.5 line-clamp-2 text-muted-foreground"
                  title={e.note}
                >
                  “{e.note}”
                </div>
              ) : null}
              <time
                className="mt-0.5 block font-mono text-[0.7813rem] text-muted-foreground tabular-nums"
                dateTime={e.at.toISOString()}
              >
                {formatDateTime(e.at)}
              </time>
            </li>
          ))}
        </ol>
      </Card>
    </section>
  );
}
