import { Prisma, type PrismaClient } from "@/lib/generated/prisma/client";
import { attendedCount, defaultDays, fitDays, type DarDays } from "./attendance";
import { autoCells, buildCells, fillDefaults, fitCells, mergeCells, statusDefaults, verbFor, type DarCells, type TicketAction, type WorkTime } from "./autofill";
import { manilaDay, periodDays, periodRange, type Period, type PeriodDay } from "./period";
import { resolveHeader, type DarHeader, type DarProfileInput } from "./template";

// Prisma glue for DARs. Every read and write is for one person's own reports; nobody, admins included, reads
// another person's DAR. Takes the client as a parameter so tests can run it against a throwaway database.

export type DarUser = { id: string; name: string; role: string };

/** Everything needed to show, edit or export one DAR. */
export type DarReportData = {
  period: Period;
  days: PeriodDay[];
  header: DarHeader;
  cells: DarCells;
  /** Each day's status (Present, Rest day…) and logged times. */
  status: DarDays;
  /** What QA Hub wrote in each cell from ticket work, sent back on save so the next update replaces it. */
  auto: DarCells;
  /** The person's work days (My account), for after-hours and pasted attendance. */
  workDays: number;
  dateSubmitted: string;
  daysAttended: number;
  saved: boolean;
};

const TICKET = { select: { number: true, title: true, areaId: true } } as const;

/** Monday to Friday, 7:00–18:00: the account defaults, for a person not found (a deleted account in an old test). */
const DEFAULT_WORK: WorkTime = { workStartMin: 420, workEndMin: 1080, workDays: 62 };

export function darStore(db: PrismaClient, now: () => Date = () => new Date()) {
  async function header(user: DarUser): Promise<DarHeader> {
    return resolveHeader(await db.darProfile.findUnique({ where: { userId: user.id } }), user);
  }

  async function workTime(userId: string): Promise<WorkTime> {
    return (await db.user.findUnique({ where: { id: userId }, select: { workStartMin: true, workEndMin: true, workDays: true } })) ?? DEFAULT_WORK;
  }

  /** What the person did in QA Hub during the period, ticket by ticket: filed, replied on, moved, assigned, edited. */
  async function activity(userId: string, p: Period): Promise<TicketAction[]> {
    const { from, to } = periodRange(p);
    const at = { gte: from, lt: to };
    const [filed, replies, events] = await Promise.all([
      db.ticket.findMany({ where: { reporterId: userId, createdAt: at }, select: { createdAt: true, number: true, title: true, areaId: true } }),
      db.ticketComment.findMany({ where: { authorId: userId, createdAt: at }, select: { createdAt: true, ticket: TICKET } }),
      // CREATED duplicates "filed"; the rest are moves, assignments and edits.
      db.ticketEvent.findMany({
        where: { actorId: userId, createdAt: at, kind: { not: "CREATED" } },
        select: { createdAt: true, kind: true, from: true, to: true, note: true, ticket: TICKET },
      }),
    ]);
    return [
      ...filed.map((t) => ({ at: t.createdAt, areaId: t.areaId, number: t.number, title: t.title, verb: "filed" })),
      ...replies.map((c) => ({ at: c.createdAt, areaId: c.ticket.areaId, number: c.ticket.number, title: c.ticket.title, verb: "replied on" })),
      ...events.flatMap((e) => {
        const verb = verbFor(e);
        return verb ? [{ at: e.createdAt, areaId: e.ticket.areaId, number: e.ticket.number, title: e.ticket.title, verb }] : [];
      }),
    ];
  }

  /** Each area with the modules above it, nearest first, for linking ticket work to DAR rows. */
  async function areaChains(): Promise<(areaId: string) => string[]> {
    const areas = await db.erpArea.findMany({ select: { id: true, parentId: true } });
    const parentOf = new Map(areas.map((a) => [a.id, a.parentId]));
    return (id) => {
      const chain: string[] = [];
      for (let at: string | null | undefined = id; at && !chain.includes(at); at = parentOf.get(at)) chain.push(at);
      return chain;
    };
  }

  /** The period worked out fresh: its days, their default statuses, and what QA Hub would write from ticket work. */
  async function compute(user: DarUser, p: Period) {
    const days = periodDays(p);
    const [h, row, work, actions, chainOf] = await Promise.all([
      header(user),
      db.darReport.findUnique({ where: { userId_periodStart: { userId: user.id, periodStart: p.start } } }),
      workTime(user.id),
      activity(user.id, p),
      areaChains(),
    ]);
    const status = fitDays(row?.days, defaultDays(days, work.workDays, manilaDay(now())));
    const blank = buildCells(h, days.map(() => ""));
    const fresh = autoCells(h, actions, days, chainOf, work);
    // Saved cells (or each day's default), with the newest ticket work merged in; nothing typed is replaced.
    const base = row ? fitCells(row.cells, buildCells(h, statusDefaults(status, days))) : buildCells(h, statusDefaults(status, days));
    const before = row ? fitCells(row.autoCells, blank) : blank;
    return { days, h, row, work, status, blank, fresh, cells: mergeCells(base, before, fresh) };
  }

  async function write(user: DarUser, p: Period, data: { cells: DarCells; dateSubmitted: string; status?: DarDays; auto?: DarCells }) {
    const json = (v: unknown) => v as Prisma.InputJsonValue;
    const values = {
      periodEnd: p.end,
      cells: json(data.cells),
      dateSubmitted: data.dateSubmitted,
      ...(data.status ? { days: json(data.status) } : {}),
      ...(data.auto ? { autoCells: json(data.auto) } : {}),
    };
    await db.darReport.upsert({
      where: { userId_periodStart: { userId: user.id, periodStart: p.start } },
      update: values,
      create: { userId: user.id, periodStart: p.start, ...values },
    });
  }

  return {
    header,
    activity,

    async profile(userId: string) {
      return db.darProfile.findUnique({ where: { userId } });
    },

    /** Empty fields are stored as null and come back empty. */
    async saveProfile(userId: string, input: DarProfileInput): Promise<void> {
      const fns = (v: DarProfileInput["coreFunctions"]) => (v.length ? (v as Prisma.InputJsonValue) : Prisma.DbNull);
      const data = {
        fullName: input.fullName || null,
        position: input.position || null,
        department: input.department || null,
        unit: input.unit || null,
        confirmedByName: input.confirmedBy.name || null,
        confirmedByTitle: input.confirmedBy.title || null,
        notedByName: input.notedBy.name || null,
        notedByTitle: input.notedBy.title || null,
        coreFunctions: fns(input.coreFunctions),
        supportFunctions: fns(input.supportFunctions),
        // Left as it is when not given: once set, it can be changed but not emptied.
        firstPeriodStart: input.firstPeriodStart || undefined,
        // Left as it is when not given.
        periodScheme: input.periodScheme ?? undefined,
      };
      await db.darProfile.upsert({ where: { userId }, update: data, create: { userId, ...data } });
    },

    /** The saved draft for the period (or a fresh one), with the newest ticket work merged in. Nothing is saved here. */
    async load(user: DarUser, p: Period): Promise<DarReportData> {
      const c = await compute(user, p);
      return {
        period: p,
        days: c.days,
        header: c.h,
        cells: c.cells,
        status: c.status,
        auto: c.fresh,
        workDays: c.work.workDays,
        dateSubmitted: c.row?.dateSubmitted ?? manilaDay(now()),
        daysAttended: attendedCount(c.status),
        saved: !!c.row,
      };
    },

    /** Saves what they typed, the day statuses, and what QA Hub had written (`auto`), shaped to the current rows and days. */
    async save(user: DarUser, p: Period, input: { cells: unknown; dateSubmitted: string; status?: unknown; auto?: unknown }): Promise<void> {
      const days = periodDays(p);
      const [h, work] = await Promise.all([header(user), workTime(user.id)]);
      const blank = buildCells(h, days.map(() => ""));
      const status = fitDays(input.status, defaultDays(days, work.workDays, manilaDay(now())));
      await write(user, p, { cells: fitCells(input.cells, blank), dateSubmitted: input.dateSubmitted, status, auto: fitCells(input.auto, blank) });
    },

    /** Merges the newest ticket work into the saved cells now, and saves. Typed text is kept. */
    async refill(user: DarUser, p: Period): Promise<DarCells> {
      const c = await compute(user, p);
      await write(user, p, { cells: c.cells, dateSubmitted: c.row?.dateSubmitted ?? manilaDay(now()), status: c.status, auto: c.fresh });
      return c.cells;
    },

    /**
     * Saves imported day entries as the person's DARs for those periods, replacing any saved ones. Cells are shaped to
     * their current duty rows, as a save from the page is. Returns how many periods were written.
     */
    async importReports(user: DarUser, reports: { period: Period; cells: unknown; dateSubmitted: string | null }[]): Promise<number> {
      const [h, work] = await Promise.all([header(user), workTime(user.id)]);
      for (const r of reports) {
        const days = periodDays(r.period);
        const status = defaultDays(days, work.workDays, manilaDay(now()));
        const shape = buildCells(h, days.map(() => ""));
        // Days the sheet left blank or dashed take the defaults: REST DAY on days off, "-" on work days.
        const cells = fillDefaults(fitCells(r.cells, shape), statusDefaults(status, days));
        await write(user, r.period, { cells, dateSubmitted: r.dateSubmitted ?? manilaDay(now()), status, auto: shape });
      }
      return reports.length;
    },

    /** The periods this person has saved, newest first. */
    async list(userId: string) {
      return db.darReport.findMany({ where: { userId }, orderBy: { periodStart: "desc" }, select: { periodStart: true, periodEnd: true, updatedAt: true } });
    },
  };
}


export type DarStore = ReturnType<typeof darStore>;
