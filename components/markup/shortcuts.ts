import {
  CircleIcon,
  CropIcon,
  EyeOffIcon,
  HighlighterIcon,
  ListOrderedIcon,
  MessageSquareTextIcon,
  MousePointer2Icon,
  MoveUpRightIcon,
  PencilLineIcon,
  SquareIcon,
  TypeIcon,
  type LucideIcon,
} from "lucide-react";
import type { Tool } from "@/lib/markup/shapes";

// The markup editor's tools and keyboard shortcuts, in one place: the toolbar, the key handler and the ? help list all
// read them from here.

export const TOOL_BUTTONS: { tool: Tool; label: string; key: string; icon: LucideIcon; hint: string }[] = [
  { tool: "select", label: "Select", key: "V", icon: MousePointer2Icon, hint: "Select a mark to move, resize, recolour or delete it" },
  { tool: "box", label: "Box", key: "B", icon: SquareIcon, hint: "Draw a box around something" },
  { tool: "ellipse", label: "Circle", key: "E", icon: CircleIcon, hint: "Draw a circle around something" },
  { tool: "arrow", label: "Arrow", key: "A", icon: MoveUpRightIcon, hint: "Point at something" },
  { tool: "pen", label: "Pen", key: "P", icon: PencilLineIcon, hint: "Draw freehand" },
  { tool: "highlight", label: "Highlight", key: "M", icon: HighlighterIcon, hint: "Highlight a field or row in yellow" },
  { tool: "text", label: "Text", key: "T", icon: TypeIcon, hint: "Click, type, then Enter" },
  { tool: "step", label: "Steps", key: "N", icon: ListOrderedIcon, hint: "Click to number the steps: 1, 2, 3…" },
  { tool: "callout", label: "Callout", key: "K", icon: MessageSquareTextIcon, hint: "Drag from the thing to where the note goes, then type" },
  { tool: "hide", label: "Hide", key: "H", icon: EyeOffIcon, hint: "Hide private data (black box)" },
  { tool: "crop", label: "Crop", key: "C", icon: CropIcon, hint: "Keep only part of the screenshot" },
];

export const toolForKey = (key: string) => TOOL_BUTTONS.find((b) => b.key.toLowerCase() === key.toLowerCase())?.tool;

/** The ? list. */
export const SHORTCUT_HELP: { keys: string; does: string }[] = [
  ...TOOL_BUTTONS.map((b) => ({ keys: b.key, does: b.label })),
  { keys: "1 – 4", does: "Colour: red, yellow, blue, black" },
  { keys: "[ and ]", does: "Text smaller / bigger" },
  { keys: "Delete", does: "Remove the selected mark" },
  { keys: "Arrow keys", does: "Nudge the selected mark (Shift: 10 px)" },
  { keys: "Double-click", does: "Retype a note or callout" },
  { keys: "Ctrl + wheel", does: "Zoom the screenshot" },
  { keys: "Ctrl + = / −", does: "Zoom in / out" },
  { keys: "Ctrl + 0", does: "Fit the screenshot" },
  { keys: "Space + drag", does: "Move around when zoomed (or drag with the wheel button)" },
  { keys: "Ctrl + Z / Y", does: "Undo / redo" },
  { keys: "Ctrl + Enter", does: "Use image" },
  { keys: "Esc", does: "Cancel what you're drawing, or deselect" },
  { keys: "?", does: "Show or hide this list" },
];
