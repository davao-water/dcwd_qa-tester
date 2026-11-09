/**
 * How a filter that is narrowing the list looks (Tickets, Users, Team): accent border and tint, so a glance shows which
 * filters are on. Unlike focus it has no ring, so the two never look alike. Used by FilterSelect, FilterDate and the
 * search boxes. A plain module (no "use client"), so server pages can use it on their own inputs.
 */
export const ACTIVE_FILTER = "border-acc bg-acc-t font-medium text-primary-text hover:border-acc";
