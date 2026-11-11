import { CROP_DIM, CROP_LINE } from "@/lib/markup/colors";
import { canvasMeasure, drawSelection, drawShape } from "@/lib/markup/draw";
import { cropOf, drawOrder, strokeFor, type Shape } from "@/lib/markup/shapes";

/** Draws the editor's canvas: the image, the marks (highlights under, hidden areas on top), the crop as a dimmed frame, the selection. */
export function drawStage(c: HTMLCanvasElement, img: HTMLImageElement, scale: number, shapes: Shape[], sel: Shape | undefined) {
  const dpr = window.devicePixelRatio || 1;
  c.width = Math.round(img.naturalWidth * scale * dpr);
  c.height = Math.round(img.naturalHeight * scale * dpr);
  const ctx = c.getContext("2d")!;
  ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
  ctx.drawImage(img, 0, 0);
  const size = { w: img.naturalWidth, h: img.naturalHeight };
  const m = canvasMeasure(ctx);
  for (const s of drawOrder(shapes)) drawShape(ctx, s, size.w, m);
  const crop = cropOf(shapes, size);
  if (crop.w < size.w || crop.h < size.h) {
    const sw = strokeFor(size.w);
    ctx.fillStyle = CROP_DIM;
    ctx.beginPath();
    ctx.rect(0, 0, size.w, size.h);
    ctx.rect(crop.x, crop.y, crop.w, crop.h);
    ctx.fill("evenodd");
    ctx.setLineDash([sw * 3, sw * 2]);
    ctx.lineWidth = Math.max(1, sw / 2);
    ctx.strokeStyle = CROP_LINE;
    ctx.strokeRect(crop.x, crop.y, crop.w, crop.h);
    ctx.setLineDash([]);
  }
  if (sel) drawSelection(ctx, sel, size.w, scale, m);
}
