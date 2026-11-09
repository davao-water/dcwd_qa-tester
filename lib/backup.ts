import { adoptLegacyTemplate } from "@/lib/dar/template";
import { Prisma, type PrismaClient } from "@/lib/generated/prisma/client";

// Supabase Free has no backups, so the laptop takes its own each night (scripts/backup.ts) as one JSON file.
// Sessions, rate-limit hits, unsent uploads, read markers and temporary access are left out: they are short-lived.
// After a restore people sign in again, tickets show as unread once, and any temporary access has ended.

export const SNAPSHOT_VERSION = 1;

/** In foreign-key order: a restore inserts them top to bottom. */
export const SNAPSHOT_TABLES = [
  "user",
  "erpArea",
  "areaMember",
  "ticket",
  "ticketComment",
  "ticketEvent",
  "attachment",
  "darProfile",
  "darReport",
  "setting",
] as const;

export type SnapshotTable = (typeof SNAPSHOT_TABLES)[number];

export type Snapshot = {
  app: "qa-hub";
  version: number;
  takenAt: string;
  tables: Record<SnapshotTable, Record<string, unknown>[]>;
};

/** Reads every table at one moment (a repeatable-read transaction), so a ticket can't appear without its comments. */
export async function takeSnapshot(db: PrismaClient, now = new Date()): Promise<Snapshot> {
  const [user, erpArea, areaMember, ticket, ticketComment, ticketEvent, attachment, darProfile, darReport, setting] = await db.$transaction(
    [
      db.user.findMany(),
      db.erpArea.findMany(),
      db.areaMember.findMany(),
      db.ticket.findMany(),
      db.ticketComment.findMany(),
      db.ticketEvent.findMany(),
      db.attachment.findMany(),
      db.darProfile.findMany(),
      db.darReport.findMany(),
      db.setting.findMany(),
    ],
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
  return {
    app: "qa-hub",
    version: SNAPSHOT_VERSION,
    takenAt: now.toISOString(),
    tables: { user, erpArea, areaMember, ticket, ticketComment, ticketEvent, attachment, darProfile, darReport, setting },
  };
}

/** Throws unless `value` looks like a file written by takeSnapshot. */
export function parseSnapshot(value: unknown): Snapshot {
  const s = value as Partial<Snapshot> | null;
  if (!s || s.app !== "qa-hub" || !s.tables) throw new Error("This file isn't a QA Hub database backup.");
  if (s.version !== SNAPSHOT_VERSION) throw new Error(`This backup is version ${s.version}; this QA Hub reads version ${SNAPSHOT_VERSION}.`);
  for (const t of SNAPSHOT_TABLES) if (!Array.isArray(s.tables[t])) throw new Error(`The backup is missing the ${t} table.`);
  return s as Snapshot;
}

/** The stored names of every attachment and profile photo in the snapshot: the Storage objects that belong with it. */
export function snapshotFiles(s: Snapshot): { storedName: string; mime: string; size: number }[] {
  const photos = s.tables.user.filter((u) => u.avatarName).map((u) => ({ storedName: String(u.avatarName), mime: String(u.avatarMime), size: Number(u.avatarSize) }));
  return [...s.tables.attachment.map((a) => ({ storedName: String(a.storedName), mime: String(a.mime), size: Number(a.size) })), ...photos];
}

const CHUNK = 500;

/**
 * Loads a snapshot into an empty database, keeping ids and timestamps. All or nothing: one transaction.
 * Refuses a database that already has accounts, tickets or modules, so it can't mix two histories.
 */
export async function restoreSnapshot(db: PrismaClient, s: Snapshot): Promise<Record<SnapshotTable, number>> {
  const [users, tickets, areas] = await Promise.all([db.user.count(), db.ticket.count(), db.erpArea.count()]);
  if (users || tickets || areas) {
    throw new Error("The database isn't empty. Restore only into a fresh one: run the migrations, but not the seed.");
  }

  const t = s.tables;
  // Backups from before 2026-11-01 still carry the removed own-tone column; anyone who had picked theirs gets Tone 1.
  const user = t.user.map((row) => {
    const u = { ...row };
    delete u.customTone;
    if (u.notifyTone === "custom") u.notifyTone = "tone-1";
    return u;
  });
  // Prisma wants DbNull, not null, for an empty optional Json column.
  const darProfile = ownDarDetails(t).map((p) => ({
    ...p,
    coreFunctions: p.coreFunctions ?? Prisma.DbNull,
    supportFunctions: p.supportFunctions ?? Prisma.DbNull,
  }));
  // A ticket can point at another as its duplicate; those links go in after every ticket exists, keeping updatedAt.
  const duplicates = t.ticket.filter((x) => x.duplicateOfId).map((x) => ({ id: String(x.id), duplicateOfId: String(x.duplicateOfId), updatedAt: x.updatedAt as string }));
  const ticket = t.ticket.map((x) => ({ ...x, duplicateOfId: null }));

  const setting = t.setting.filter((x) => x.key !== LEGACY_DAR_TEMPLATE);

  return db.$transaction(
    async (tx) => {
      const insert = async <T>(rows: T[], createMany: (data: T[]) => Promise<unknown>) => {
        for (let i = 0; i < rows.length; i += CHUNK) await createMany(rows.slice(i, i + CHUNK));
      };
      await insert(user, (data) => tx.user.createMany({ data: data as Prisma.UserCreateManyInput[] }));
      // Restored numbers don't move the counter, so the next new account would take someone's colours.
      await tx.$queryRaw`SELECT setval(pg_get_serial_sequence('"User"', 'avatarColor'), GREATEST((SELECT COALESCE(MAX("avatarColor"), 0) FROM "User"), 1))`;
      // Parents before children, one level of the module tree at a time.
      for (const level of areaLevels(t.erpArea)) await insert(level, (data) => tx.erpArea.createMany({ data: data as Prisma.ErpAreaCreateManyInput[] }));
      await insert(t.areaMember, (data) => tx.areaMember.createMany({ data: data as Prisma.AreaMemberCreateManyInput[] }));
      await insert(ticket, (data) => tx.ticket.createMany({ data: data as Prisma.TicketCreateManyInput[] }));
      for (const d of duplicates) await tx.ticket.update({ where: { id: d.id }, data: { duplicateOfId: d.duplicateOfId, updatedAt: d.updatedAt } });
      await insert(t.ticketComment, (data) => tx.ticketComment.createMany({ data: data as Prisma.TicketCommentCreateManyInput[] }));
      await insert(t.ticketEvent, (data) => tx.ticketEvent.createMany({ data: data as Prisma.TicketEventCreateManyInput[] }));
      await insert(t.attachment, (data) => tx.attachment.createMany({ data: data as Prisma.AttachmentCreateManyInput[] }));
      await insert(darProfile, (data) => tx.darProfile.createMany({ data: data as Prisma.DarProfileCreateManyInput[] }));
      await insert(t.darReport, (data) => tx.darReport.createMany({ data: data as Prisma.DarReportCreateManyInput[] }));
      await insert(setting, (data) => tx.setting.createMany({ data: data as Prisma.SettingCreateManyInput[] }));
      return Object.fromEntries(SNAPSHOT_TABLES.map((name) => [name, t[name].length])) as Record<SnapshotTable, number>;
    },
    { timeout: 5 * 60_000, maxWait: 30_000 },
  );
}

const LEGACY_DAR_TEMPLATE = "dar.template";

/**
 * Backups from before 2026-11-01 had one shared DAR template and profiles holding only overrides. Like migration
 * dar_own_details, everyone who had a DAR gets the template's values in their own empty fields, so it looks the same.
 */
function ownDarDetails(t: Snapshot["tables"]): Record<string, unknown>[] {
  if (t.darProfile.some((p) => "department" in p)) return t.darProfile;
  const template = t.setting.find((x) => x.key === LEGACY_DAR_TEMPLATE)?.value;
  const have = new Set(t.darProfile.map((p) => p.userId));
  const missing = [...new Set(t.darReport.map((r) => r.userId))].filter((id) => !have.has(id)).map((userId) => ({ userId, updatedAt: new Date().toISOString() }));
  return [...t.darProfile, ...missing].map((p) => adoptLegacyTemplate(p, template));
}

/** Splits the module tree into levels: top-level modules, then their sub-modules, and so on. */
function areaLevels(rows: Record<string, unknown>[]): Record<string, unknown>[][] {
  const levels: Record<string, unknown>[][] = [];
  const placed = new Set<unknown>([null, undefined]);
  let left = rows;
  while (left.length) {
    const level = left.filter((r) => placed.has(r.parentId));
    if (!level.length) throw new Error("The backup's module list refers to a parent module that isn't in it.");
    level.forEach((r) => placed.add(r.id));
    levels.push(level);
    left = left.filter((r) => !level.includes(r));
  }
  return levels;
}
