import type { Role } from "@/lib/auth/permissions";

/** One tab over the ticket list: its name and the filters it sets. */
export type Quick = {
  label: string;
  patch: {
    group: string;
    status: string | null;
    assignee: string | null;
    reporter: string | null;
  };
};
const quick = (
  label: string,
  group: string,
  status: string | null = null,
  assignee: string | null = null,
  reporter: string | null = null,
): Quick => ({
  label,
  patch: { group, status, assignee, reporter },
});

/**
 * Everyone's list is already limited to their own tickets, so these only split it by stage. Admins also get "mine".
 * The board has the same views: it lays out the same tickets by stage.
 */
export function quickViews(role: Role): Quick[] {
  const stages = [
    quick("Needs info", "open", "NEED_INFO"),
    quick("Waiting for retest", "open", "FIXED"),
    quick("Done", "done"),
    quick("All", "all"),
  ];
  if (role === "ADMIN")
    return [
      quick("Open", "open"),
      quick("Assigned to me", "open", null, "me"),
      quick("Reported by me", "open", null, null, "me"),
      ...stages,
    ];
  return [
    quick(role === "DEV" ? "Assigned to me" : "My open tickets", "open"),
    ...stages,
  ];
}
