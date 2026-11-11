"use client";

import { Redo2Icon, Trash2Icon, Undo2Icon, ZoomInIcon, ZoomOutIcon } from "lucide-react";
import { Button } from "../ui/button";
import { MARK_COLORS } from "@/lib/markup/colors";
import { TEXT_SIZES, type TextSize, type Tool } from "@/lib/markup/shapes";
import { cn } from "@/lib/utils";
import { SHORTCUT_HELP, TOOL_BUTTONS } from "./shortcuts";

// The markup editor's toolbar: tools, colour, text size, undo/redo, zoom and the shortcut list. Colour and size apply
// to the selected mark when there is one, otherwise to the next one drawn.

const divider = <span className="mx-1 h-6 w-px bg-line2 max-md:shrink-0" aria-hidden />;

/** Phones: 44 px targets for a finger, in rows that scroll sideways instead of wrapping over the screenshot. */
const TOUCH = "max-md:size-11 max-md:shrink-0";

export function MarkupToolbar(p: {
  className?: string;
  tool: Tool;
  onTool: (t: Tool) => void;
  color: string;
  onColor: (c: string) => void;
  /** Shown while the tool or the selected mark has text. */
  showSize: boolean;
  textSize: TextSize | null;
  onTextSize: (s: TextSize) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  canClear: boolean;
  onClear: () => void;
  zoomPercent: number;
  canZoomIn: boolean;
  canZoomOut: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  help: boolean;
  onHelp: () => void;
}) {
  return (
    <div className={cn("grid gap-2", p.className)}>
      <div role="toolbar" aria-label="Markup tools" className="flex flex-wrap items-center gap-1 max-md:flex-nowrap max-md:short:flex-wrap max-md:overflow-x-auto max-md:p-0.5 max-md:[scrollbar-width:none]">
        {TOOL_BUTTONS.map(({ tool, label, key, icon: Icon, hint }) => (
          <Button
            key={tool}
            type="button"
            size="sm"
            variant={p.tool === tool ? "soft" : "ghost"}
            aria-pressed={p.tool === tool}
            title={`${hint} (${key})`}
            onClick={() => p.onTool(tool)}
            className="gap-1.5 px-2.5 text-sm max-md:h-11 max-md:shrink-0"
          >
            <Icon /> {label}
            <kbd className="hidden rounded border border-line2 px-1 font-mono text-[0.6875rem] leading-4 font-medium text-muted-foreground lg:inline">{key}</kbd>
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 max-md:flex-nowrap max-md:short:flex-wrap max-md:overflow-x-auto max-md:py-0.5 max-md:pl-0.5 max-md:[scrollbar-width:none]">
        <div role="group" aria-label="Colour" className="flex items-center gap-1.5 max-md:shrink-0">
          {MARK_COLORS.map((c, i) => (
            <button
              key={c.value}
              type="button"
              aria-pressed={p.color === c.value}
              aria-label={c.name}
              title={`${c.name} (${i + 1})`}
              onClick={() => p.onColor(c.value)}
              className={cn(
                "size-7 cursor-pointer rounded-full border-2 border-card max-md:size-9 shadow-[0_0_0_0.0625rem_var(--line)] focus-visible:ring-3 focus-visible:ring-acc/30 focus-visible:outline-none",
                p.color === c.value && "shadow-[0_0_0_0.125rem_var(--acc)]",
              )}
              style={{ backgroundColor: c.value }}
            />
          ))}
        </div>
        {p.showSize ? (
          <>
            {divider}
            <div role="group" aria-label="Text size" className="flex items-center gap-0.5 max-md:shrink-0">
              {TEXT_SIZES.map((s) => (
                <Button
                  key={s.id}
                  type="button"
                  size="sm"
                  variant={p.textSize === s.id ? "soft" : "ghost"}
                  aria-pressed={p.textSize === s.id}
                  aria-label={`${s.label} text`}
                  title={`${s.label} text ([ smaller, ] bigger)`}
                  className="min-w-9 px-2 max-md:h-11 max-md:min-w-11"
                  onClick={() => p.onTextSize(s.id)}
                >
                  {s.id}
                </Button>
              ))}
            </div>
          </>
        ) : null}
        {divider}
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Undo (Ctrl+Z)" title="Undo (Ctrl+Z)" disabled={!p.canUndo} focusableWhenDisabled onClick={p.onUndo} className={TOUCH}>
          <Undo2Icon />
        </Button>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Redo (Ctrl+Y)" title="Redo (Ctrl+Y)" disabled={!p.canRedo} focusableWhenDisabled onClick={p.onRedo} className={TOUCH}>
          <Redo2Icon />
        </Button>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Clear all marks" title="Clear all marks" disabled={!p.canClear} focusableWhenDisabled onClick={p.onClear} className={TOUCH}>
          <Trash2Icon />
        </Button>
        {divider}
        <div role="group" aria-label="Zoom" className="flex items-center gap-0.5 max-md:shrink-0">
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Zoom out (Ctrl+−)" title="Zoom out (Ctrl+− or Ctrl+wheel)" disabled={!p.canZoomOut} focusableWhenDisabled onClick={p.onZoomOut} className={TOUCH}>
            <ZoomOutIcon />
          </Button>
          <span className="w-12 text-center font-mono text-[0.7813rem] text-muted-foreground tabular-nums" aria-live="polite">{p.zoomPercent}%</span>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Zoom in (Ctrl+=)" title="Zoom in (Ctrl+= or Ctrl+wheel)" disabled={!p.canZoomIn} focusableWhenDisabled onClick={p.onZoomIn} className={TOUCH}>
            <ZoomInIcon />
          </Button>
          {/* Text buttons, as on the board. */}
          <Button type="button" variant="ghost" size="sm" title="Fit the screenshot (Ctrl+0)" onClick={p.onFit} className="px-2.5 text-sm max-md:h-11">
            Fit
          </Button>
        </div>
        <Button type="button" variant={p.help ? "soft" : "ghost"} size="sm" aria-pressed={p.help} title="Keyboard shortcuts (?)" onClick={p.onHelp} className="ml-auto px-2.5 text-sm max-md:hidden">
          Shortcuts
        </Button>
      </div>
      {/* Every shortcut (SHORTCUT_HELP), in the board's panel: light background, thin border, keys in mono. */}
      {p.help ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg border border-line2 bg-surface2 px-3 py-2.5 text-[0.8125rem] sm:grid-cols-[auto_1fr_auto_1fr]">
          {SHORTCUT_HELP.map((s) => (
            <div key={s.keys} className="contents">
              <dt className="font-mono font-medium text-foreground">{s.keys}</dt>
              <dd className="text-body2">{s.does}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}
