/**
 * The stage height on laptops: about 62% of the window as before, but never more than the window has left after the
 * rest of the dialog (title, tools, notices, the Use image row and the dialog's padding), so those always stay in view.
 */
export function desktopStageHeight(stageEl: HTMLElement): number {
  const dialog = stageEl.closest<HTMLElement>("[data-markup-dialog]");
  const chrome = dialog ? dialog.scrollHeight - stageEl.offsetHeight : 0;
  // The dialog may be the window's height minus 1rem (its max-height); keep a little more for the browser's rounding.
  const room = window.innerHeight - 16 - 4 - chrome;
  return Math.round(Math.max(160, Math.min(window.innerHeight * 0.62, room)));
}
