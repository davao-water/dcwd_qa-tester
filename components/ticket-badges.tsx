import { BugIcon, LightbulbIcon, SparklesIcon } from "lucide-react";
import { StatusPill } from "@/components/status-pill";
import { cn } from "@/lib/utils";
import { PRIORITY_LABELS, SEVERITY_LABELS, STATUS_LABELS, STATUS_TONES, TYPE_LABELS, TYPE_TONES, type SeverityValue, type TicketStatus, type TicketType, type TypeTone } from "@/lib/tickets/workflow";

type PriorityValue = keyof typeof PRIORITY_LABELS;

export function TicketStatusPill({ status, className }: { status: TicketStatus; className?: string }) {
  return (
    <StatusPill tone={STATUS_TONES[status]} className={className}>
      {STATUS_LABELS[status]}
    </StatusPill>
  );
}

export const TYPE_ICON = { BUG: BugIcon, SUGGESTION: LightbulbIcon, IMPROVEMENT: SparklesIcon };

/** Each type's colour (Bug red, Suggestion amber, Improvement blue), as whole class names so Tailwind sees them. */
export const TYPE_STYLE: Record<TypeTone, { chip: string; icon: string; stripe: string; choice: string; tile: string }> = {
  bug: {
    tile: "bg-type-bug-t text-type-bug",
    chip: "border-type-bug-b bg-type-bug-t text-type-bug",
    icon: "text-type-bug",
    stripe: "shadow-[inset_0.1875rem_0_0_var(--type-bug)]",
    choice: "has-checked:border-type-bug has-checked:bg-type-bug-t hover:border-type-bug-b",
  },
  sug: {
    tile: "bg-type-sug-t text-type-sug",
    chip: "border-type-sug-b bg-type-sug-t text-type-sug",
    icon: "text-type-sug",
    stripe: "shadow-[inset_0.1875rem_0_0_var(--type-sug)]",
    choice: "has-checked:border-type-sug has-checked:bg-type-sug-t hover:border-type-sug-b",
  },
  imp: {
    tile: "bg-type-imp-t text-type-imp",
    chip: "border-type-imp-b bg-type-imp-t text-type-imp",
    icon: "text-type-imp",
    stripe: "shadow-[inset_0.1875rem_0_0_var(--type-imp)]",
    choice: "has-checked:border-type-imp has-checked:bg-type-imp-t hover:border-type-imp-b",
  },
};

export const typeStyle = (type: TicketType) => TYPE_STYLE[TYPE_TONES[type]];

/** The ticket's type as a small chip in its colour. */
export function TicketTypeLabel({ type, className }: { type: TicketType; className?: string }) {
  const Icon = TYPE_ICON[type];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-px text-[0.75rem] font-medium", typeStyle(type).chip, className)}>
      <Icon className="size-3.5" aria-hidden />
      {TYPE_LABELS[type]}
    </span>
  );
}

/** Phones: the type as a rounded coloured square with its icon, leading each ticket row. Its name is for screen readers. */
export function TypeTile({ type, className }: { type: TicketType; className?: string }) {
  const Icon = TYPE_ICON[type];
  return (
    <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-[0.625rem]", typeStyle(type).tile, className)}>
      <Icon className="size-[1.125rem]" aria-hidden />
      <span className="sr-only">{TYPE_LABELS[type]}</span>
    </span>
  );
}

/** Severity and priority share one colour scale, 1 to 4: red, orange, blue, grey (the --level-* tokens). */
const LEVEL_DOTS = ["bg-level-1", "bg-level-2", "bg-level-3", "bg-level-4"];
const LEVEL_TINTS = ["bg-level-1/15", "bg-level-2/15", "bg-level-3/15", "bg-level-4/15"];

/** "S1" or "P1" to its place on the scale. */
const levelIndex = (value: string) => Number(value[1]) - 1;

/** The dot's colour class for a severity or priority, as whole class names so Tailwind sees them. */
export const levelDot = (value: string) => LEVEL_DOTS[levelIndex(value)];

export const levelName = (value: SeverityValue | PriorityValue) => (value[0] === "S" ? SEVERITY_LABELS[value as SeverityValue] : PRIORITY_LABELS[value as PriorityValue]);

/** A short tag for lists and cards, such as "S1" or "P3", with its full name on hover. The colour is never alone. */
export function LevelTag({ value, className }: { value: SeverityValue | PriorityValue; className?: string }) {
  return (
    <span title={levelName(value)} className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[0.7188rem] font-semibold text-foreground", LEVEL_TINTS[levelIndex(value)], className)}>
      <span className={cn("size-1.5 rounded-full", levelDot(value))} aria-hidden />
      {value}
      <span className="sr-only"> {levelName(value)}</span>
    </span>
  );
}

/** The full name with its dot, such as "P3 Normal", for the ticket page. */
export function LevelLabel({ value }: { value: SeverityValue | PriorityValue }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("size-2 shrink-0 rounded-full", levelDot(value))} aria-hidden />
      {levelName(value)}
    </span>
  );
}

/** Bugs show their severity; other types show their priority in the same place. */
export function SeverityTag({ severity, priority }: { severity: SeverityValue | null; priority?: PriorityValue }) {
  if (severity) return <LevelTag value={severity} />;
  return priority ? <LevelTag value={priority} /> : null;
}

/**
 * The red dot on a ticket with activity you haven't opened yet, everywhere in QA Hub. A soft ring pulses out of it now
 * and then, to catch the eye. Screen readers hear "Unread".
 */
export function UnreadDot({ className }: { className?: string }) {
  return (
    <span className={cn("pop-in relative inline-block size-2 shrink-0 rounded-full bg-bad", className)}>
      <span className="qa-ping absolute inset-0 rounded-full bg-bad" aria-hidden />
      <span className="sr-only">Unread</span>
    </span>
  );
}
