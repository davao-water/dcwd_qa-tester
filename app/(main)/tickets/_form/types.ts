import type { Role } from "@/lib/auth/permissions";
import { PRIORITIES, type DeviceType, type SeverityValue, type TicketType } from "@/lib/tickets/workflow";

/** A module with what's inside it, at every level (lib/areas/tree.ts). */
export type AreaOption = { id: string; name: string; children: AreaOption[] };
/** A developer or admin, with the areas they belong to, so the picker can suggest the right people. */
export type AssigneeOption = { id: string; name: string; role: Role; areaIds: string[]; leadAreaIds: string[] };

export type TicketValues = {
  id: string;
  number: number;
  type: TicketType;
  title: string;
  description: string;
  areaId: string | null;
  severity: SeverityValue | null;
  priority: (typeof PRIORITIES)[number];
  foundIn: string | null;
  deviceType: DeviceType | null;
};

export type TicketFormProps = {
  areas: AreaOption[];
  people: AssigneeOption[];
  canAssign: boolean;
  ticket?: TicketValues;
  onDone?: () => void;
  /** New ticket only: whose draft to keep in this browser (lib/tickets/draft.ts). */
  draftUserId?: string;
};

/** What Share → QA Hub brought. None means it didn't arrive. */
export type SharedFiles = { files: File[] };
