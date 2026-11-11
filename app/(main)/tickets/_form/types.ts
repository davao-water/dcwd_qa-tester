import type { AreaOption, AssigneeOption } from "@/lib/tickets/form-options";
import { PRIORITIES, type DeviceType, type SeverityValue, type TicketType } from "@/lib/tickets/workflow";

// The pickers' option lists are loaded in lib/tickets/form-options.ts; their types are passed on from here.
export type { AreaOption, AssigneeOption };

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
