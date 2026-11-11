import { canvasMeasure, drawShape } from "@/lib/markup/draw";
import { encodeCanvas } from "@/lib/markup/encode";
import { markedName } from "@/lib/markup/export";
import { cropOf, drawOrder, type Shape } from "@/lib/markup/shapes";
import { IMAGE_MAX_BYTES } from "@/lib/uploads/limits";

/** The marked-up image at full resolution, cropped, in the smallest format that keeps it sharp (lib/markup/encode.ts). */
export async function exportImage(img: HTMLImageElement, shapes: Shape[], name: string): Promise<File> {
  const size = { w: img.naturalWidth, h: img.naturalHeight };
  const crop = cropOf(shapes, size);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(crop.w);
  canvas.height = Math.round(crop.h);
  const ctx = canvas.getContext("2d")!;
  ctx.translate(-crop.x, -crop.y);
  ctx.drawImage(img, 0, 0);
  const measure = canvasMeasure(ctx);
  for (const s of drawOrder(shapes)) drawShape(ctx, s, size.w, measure);

  const out = await encodeCanvas(canvas);
  if (!out) throw new Error(`The image is still larger than ${IMAGE_MAX_BYTES / 1024 / 1024} MB. Crop it to the part that matters.`);
  return new File([out.blob], markedName(name, out.format), { type: out.format.mime });
}
