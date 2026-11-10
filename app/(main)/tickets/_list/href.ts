import type { TicketFilters } from "@/lib/schemas/ticket";

/** Builds a /tickets URL from the current filters with some of them changed. Page resets unless given. */
export function hrefWith(
  f: TicketFilters,
  patch: Partial<Record<keyof TicketFilters, string | number | null>>,
): string {
  const merged: Record<string, string | number | null> = {
    ...f,
    page: null,
    ...patch,
  };
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) {
    if (
      v === null ||
      v === "" ||
      (k === "group" && v === "open") ||
      (k === "page" && v === 1)
    )
      continue;
    qs.set(k, String(v));
  }
  const s = qs.toString();
  return s ? `/tickets?${s}` : "/tickets";
}
