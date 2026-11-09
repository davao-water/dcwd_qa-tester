"use server";

import { revalidatePath } from "next/cache";
import { requireAction } from "@/lib/auth/session";
import type { DarCells } from "@/lib/dar/autofill";
import { darStore } from "@/lib/dar/store";
import { z } from "zod";
import { DEFAULT_SCHEME, parsePeriod, schemeOfStart } from "@/lib/dar/period";
import { darProfileInput } from "@/lib/dar/template";
import { db } from "@/lib/db";
import { fromZodError, jsonField, text, type FormState } from "@/lib/form";

const dar = darStore(db);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Saves the day cells and date submitted. Only ever the signed-in person's own report. */
export async function saveDar(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireAction("dar.use");
  const period = parsePeriod(text(fd, "period"));
  if (!period) return { ok: false, message: "That period isn't valid. Pick one from the list." };
  const dateSubmitted = text(fd, "dateSubmitted");
  if (!DATE.test(dateSubmitted)) return { ok: false, message: "Pick the date submitted." };
  await dar.save(me, period, { cells: jsonField(fd, "cells"), dateSubmitted, status: jsonField(fd, "status"), auto: jsonField(fd, "auto") });
  revalidatePath("/dar");
  return { ok: true, message: "Saved." };
}

/** Adds the newest ticket work to the rows marked "fill from my ticket work" and saves; nothing typed is replaced. */
export async function refillDar(_prev: FormState, fd: FormData): Promise<FormState & { cells?: DarCells }> {
  const me = await requireAction("dar.use");
  const period = parsePeriod(text(fd, "period"));
  if (!period) return { ok: false, message: "That period isn't valid. Pick one from the list." };
  const cells = await dar.refill(me, period);
  revalidatePath("/dar");
  return { ok: true, message: "Added your latest ticket work.", cells };
}

/** My details: everything fixed on the person's own report, used for every period. */
export async function saveDarProfile(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireAction("dar.use");
  const parsed = darProfileInput.safeParse({
    fullName: text(fd, "fullName"),
    position: text(fd, "position"),
    department: text(fd, "department"),
    unit: text(fd, "unit"),
    confirmedBy: { name: text(fd, "confirmedName"), title: text(fd, "confirmedTitle") },
    notedBy: { name: text(fd, "notedName"), title: text(fd, "notedTitle") },
    coreFunctions: jsonField(fd, "coreFunctions") ?? [],
    supportFunctions: jsonField(fd, "supportFunctions") ?? [],
    firstPeriodStart: text(fd, "firstPeriodStart"),
    periodScheme: text(fd, "periodScheme") || undefined,
  });
  if (!parsed.success) return fromZodError(parsed.error);
  await dar.saveProfile(me.id, parsed.data);
  revalidatePath("/dar");
  revalidatePath("/dar/setup");
  return { ok: true, message: "Saved. Your DAR uses it from now on." };
}

const importPayload = z.object({
  profile: z.unknown(),
  reports: z
    .array(z.object({ periodStart: z.string(), cells: z.unknown(), dateSubmitted: z.string().regex(DATE).nullable() }))
    .max(120),
});

/**
 * Sets up My DAR from an imported Excel workbook (read in the browser by lib/dar/import.ts): saves My details, then the
 * chosen periods' day entries, replacing those periods' saved DARs. Only ever the signed-in person's own.
 */
export async function importDar(payload: string): Promise<FormState & { period?: string }> {
  const me = await requireAction("dar.use");
  let raw: unknown;
  try {
    raw = JSON.parse(payload);
  } catch {
    return { ok: false, message: "The import didn't come through. Pick the file again." };
  }
  const parsed = importPayload.safeParse(raw);
  if (!parsed.success) return { ok: false, message: "The import didn't come through. Pick the file again." };
  const profile = darProfileInput.safeParse(parsed.data.profile);
  if (!profile.success) return { ok: false, message: profile.error.issues[0]?.message ?? "Some details in the file can't be used. Check them under My details." };

  const scheme = profile.data.periodScheme ?? DEFAULT_SCHEME;
  const reports = [];
  for (const r of parsed.data.reports) {
    const period = parsePeriod(r.periodStart);
    if (!period || schemeOfStart(period.start) !== scheme) return { ok: false, message: "A period in the file doesn't match your period days. Pick the file again." };
    reports.push({ period, cells: r.cells, dateSubmitted: r.dateSubmitted });
  }

  await dar.saveProfile(me.id, profile.data);
  const n = await dar.importReports(me, reports);
  revalidatePath("/dar");
  revalidatePath("/dar/setup");
  const newest = reports.map((r) => r.period.start).sort().at(-1);
  return { ok: true, message: n ? `Imported your details and ${n} period${n === 1 ? "" : "s"}.` : "Imported your details.", period: newest };
}
