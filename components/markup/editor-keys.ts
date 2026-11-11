import { MARK_COLORS } from "@/lib/markup/colors";
import { move } from "@/lib/markup/geometry";
import { redo, undo } from "@/lib/markup/history";
import { ZOOM_STEP } from "@/lib/markup/view";
import { toolForKey } from "./shortcuts";
import type { Marks } from "./use-marks";

/** The editor's keyboard shortcuts (see shortcuts.ts), as a keydown handler for the dialog. */
export function editorKeys({
  marks,
  scale,
  fit,
  zoomTo,
  saveImage,
  setSpaceHeld,
  setHelp,
}: {
  marks: Marks;
  scale: number;
  fit: number;
  zoomTo: (target: number) => void;
  saveImage: () => Promise<void>;
  setSpaceHeld: (held: boolean) => void;
  setHelp: (f: (h: boolean) => boolean) => void;
}) {
  const { changeHistory, selected, setSelected, present, removeAt, replaceAt, bumpSize, pickColor, pickTool } = marks;
  return function onKeyDown(e: React.KeyboardEvent) {
    if ((e.target as HTMLElement).tagName === "INPUT") return;
    const k = e.key;
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl) {
      const lower = k.toLowerCase();
      if (lower === "z") changeHistory(e.shiftKey ? redo : undo);
      else if (lower === "y") changeHistory(redo);
      else if (k === "Enter") void saveImage();
      else if (k === "=" || k === "+") zoomTo(scale * ZOOM_STEP);
      else if (k === "-" || k === "_") zoomTo(scale / ZOOM_STEP);
      else if (k === "0") zoomTo(fit);
      else return;
      e.preventDefault();
      return;
    }
    if (e.altKey) return;
    if (k === " ") {
      e.preventDefault();
      setSpaceHeld(true);
      return;
    }
    if (k === "?") return setHelp((h) => !h);
    const sel = selected !== null ? present[selected] : undefined;
    if ((k === "Delete" || k === "Backspace") && sel) {
      e.preventDefault();
      removeAt(selected!);
      setSelected(null);
      return;
    }
    if (k.startsWith("Arrow") && sel) {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      const dx = k === "ArrowLeft" ? -step : k === "ArrowRight" ? step : 0;
      const dy = k === "ArrowUp" ? -step : k === "ArrowDown" ? step : 0;
      replaceAt(selected!, move(sel, dx, dy));
      return;
    }
    if (k === "[" || k === "]") return bumpSize(k === "]" ? 1 : -1);
    if (/^[1-4]$/.test(k)) return pickColor(MARK_COLORS[Number(k) - 1].value);
    const t = toolForKey(k);
    if (t) {
      e.preventDefault();
      pickTool(t);
    }
  };
}
