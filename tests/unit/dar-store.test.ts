import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { NO_ENTRY, REST_DAY } from "@/lib/dar/autofill";
import { darXlsx } from "@/lib/dar/excel";
import { darStore, type DarUser } from "@/lib/dar/store";
import { LEGACY_TEMPLATE, type DarProfileInput } from "@/lib/dar/template";
import { createTestDb } from "./helpers/test-db";

let db: PrismaClient;
let cleanup: () => Promise<void>;
let ana: DarUser, ben: DarUser, dev: DarUser;
let bca: string, rsp: string;

const OCT = { start: "2026-10-01", end: "2026-10-15" };
/** 10:00 in Manila on that October day. */
const day = (d: number) => new Date(Date.UTC(2026, 9, d, 2));
const now = () => new Date("2026-10-16T01:00:00Z");

/** The QA set-up used before 2026-11-01: one auto-filled core row; support rows 1 and 3 typed, row 2 auto-filled. */
const QA_SETUP: DarProfileInput = {
  fullName: "",
  position: LEGACY_TEMPLATE.position,
  department: LEGACY_TEMPLATE.department,
  unit: LEGACY_TEMPLATE.unit,
  confirmedBy: LEGACY_TEMPLATE.confirmedBy,
  notedBy: LEGACY_TEMPLATE.notedBy,
  coreFunctions: LEGACY_TEMPLATE.coreFunctions,
  supportFunctions: LEGACY_TEMPLATE.supportFunctions,
};

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
});
afterAll(async () => {
  await cleanup();
});

beforeEach(async () => {
  await db.darReport.deleteMany();
  await db.darProfile.deleteMany();
  await db.ticket.deleteMany();
  await db.erpArea.deleteMany({ where: { parentId: { not: null } } });
  await db.erpArea.deleteMany();
  await db.user.deleteMany();
  const mk = async (name: string, role: "QA" | "DEV" = "QA") => {
    const u = await db.user.create({ data: { name, email: `${name.toLowerCase()}@x.ph`, passwordHash: "x", role } });
    return { id: u.id, name, role };
  };
  ana = await mk("Ana");
  ben = await mk("Ben");
  dev = await mk("Dan", "DEV");
  const s = darStore(db, now);
  await s.saveProfile(ana.id, QA_SETUP);
  await s.saveProfile(ben.id, QA_SETUP);
  bca = (await db.erpArea.create({ data: { name: "Billing & Collection", code: "BCA" } })).id;
  const hr = (await db.erpArea.create({ data: { name: "HR", code: "HR" } })).id;
  rsp = (await db.erpArea.create({ data: { name: "Recruitment", code: "HR-RSP", parentId: hr } })).id;

  // Ana files a BCA ticket on Oct 1 and replies on an HR-RSP ticket on Oct 5; Ben files one on Oct 2.
  let n = 0;
  const ticket = (reporterId: string, areaId: string, at: Date) =>
    db.ticket.create({ data: { number: ++n, type: "BUG", title: "T", description: "D", reporterId, areaId, createdAt: at, lastActivityAt: at } });
  await ticket(ana.id, bca, day(1));
  const other = await ticket(ben.id, rsp, day(2));
  await db.ticketComment.create({ data: { ticketId: other.id, authorId: ana.id, body: "hi", createdAt: day(5) } });
  await db.ticketEvent.create({ data: { ticketId: other.id, actorId: ana.id, kind: "STATUS", from: "FIXED", to: "VERIFIED", createdAt: day(5) } });
});

describe("darStore", () => {
  it("fills a fresh report from the tester's own activity only", async () => {
    const s = darStore(db, now);
    const r = await s.load(ana, OCT);
    expect(r.saved).toBe(false);
    expect(r.days).toHaveLength(15);
    // One entry per ticket, in the order things happened.
    expect(r.cells.core[0][0]).toBe("Filed #1 T");
    expect(r.cells.core[0][1]).toBe(NO_ENTRY); // Ben's ticket, not Ana's; a Friday, so "-"
    expect(r.cells.core[0][4]).toBe("Replied on & verified #2 T");
    // Not an auto-fill row: each day's default, "-" on work days and REST DAY on the weekend (Oct 3 and 4).
    expect(r.cells.support[0].slice(0, 5)).toEqual([NO_ENTRY, NO_ENTRY, REST_DAY, REST_DAY, NO_ENTRY]);
    // Both fill rows of the old QA set-up have no modules, so both take the work.
    expect(r.cells.support[1][0]).toBe("Filed #1 T");
    // Days Attended counts the Present days: Oct 1–15 has 11 work days, all past by Oct 16.
    expect(r.status["2026-10-03"].status).toBe("REST");
    expect(r.status["2026-10-01"].status).toBe("PRESENT");
    expect(r.daysAttended).toBe(11);
    expect(r.dateSubmitted).toBe("2026-10-16");

    expect((await s.load(ben, OCT)).cells.core[0][1]).toBe("Filed #2 T");
  });

  it("saves edits per person and keeps them apart", async () => {
    const s = darStore(db, now);
    const r = await s.load(ana, OCT);
    r.cells.core[0][2] = "HR201";
    r.cells.support[0][2] = "Encoding";
    const status = { ...r.status, "2026-10-02": { status: "LEAVE" as const } };
    await s.save(ana, OCT, { cells: { ...r.cells, core: [[...r.cells.core[0], "too many"]] }, dateSubmitted: "2026-10-17", status, auto: r.auto });

    const again = await s.load(ana, OCT);
    expect(again.saved).toBe(true);
    expect(again.cells.core[0][2]).toBe("HR201");
    expect(again.cells.core[0]).toHaveLength(15);
    expect(again.dateSubmitted).toBe("2026-10-17");
    expect(again.status["2026-10-02"].status).toBe("LEAVE");
    expect(again.daysAttended).toBe(10);
    // The saved entry isn't added a second time when the page loads again.
    expect(again.cells.core[0][0]).toBe("Filed #1 T");
    expect((await s.load(ben, OCT)).saved).toBe(false);
    expect(await s.list(ana.id)).toHaveLength(1);
    expect(await s.list(ben.id)).toHaveLength(0);

    // New ticket work merges into the saved cells next to what was typed, and replaces QA Hub's own earlier entry.
    const two = await db.ticket.findFirstOrThrow({ where: { number: 2 } });
    await db.ticketComment.create({ data: { ticketId: two.id, authorId: ana.id, body: "again", createdAt: day(1) } });
    const cells = await s.refill(ana, OCT);
    expect(cells.core[0][0]).toBe("Filed #1 T; replied on #2 T");
    expect(cells.core[0][2]).toBe("HR201");
    expect(cells.support[0][2]).toBe("Encoding");
    expect((await s.refill(ana, OCT)).core[0][0]).toBe("Filed #1 T; replied on #2 T");
  });

  it("starts a new account empty: no rows until they set up their DAR", async () => {
    const s = darStore(db, now);
    const r = await s.load(dev, OCT);
    expect(r.header).toMatchObject({ name: "Dan", position: "", department: "", unit: "", supervisor: "", core: [], support: [] });
    expect(r.cells).toEqual({ core: [], support: [] });
    // Days Attended comes from the day statuses (every past work day starts Present), not from rows.
    expect(r.daysAttended).toBe(11);
  });

  it("saves each person's own set-up, and fills a developer's days with DEV", async () => {
    const s = darStore(db, now);
    await db.ticketComment.create({ data: { ticketId: (await db.ticket.findFirstOrThrow({ where: { number: 1 } })).id, authorId: dev.id, body: "Fixed", createdAt: day(3) } });
    await s.saveProfile(dev.id, {
      fullName: "Dan R. Reyes",
      position: "Developer",
      department: "ICT Department",
      unit: "Systems Development Unit",
      confirmedBy: { name: "Lead Dev", title: "OIC, Systems Development Unit" },
      notedBy: { name: "", title: "" },
      coreFunctions: [{ duty: "Fixes ERP bugs", mfo: "Fixed tickets", autofill: true }],
      supportFunctions: [],
    });
    const r = await s.load(dev, OCT);
    expect(r.header).toMatchObject({ name: "Dan R. Reyes", unit: "Systems Development Unit", supervisor: "Lead Dev", notedBy: { name: "", title: "" }, support: [] });
    // A Saturday reply: after hours on a rest day.
    expect(r.cells.core[0][2]).toBe("REST DAY · After hours: Replied on #1 T");
    expect(r.cells.support).toEqual([]);

    // Clearing a field clears it on the report; Ana's set-up is untouched.
    await s.saveProfile(dev.id, { ...QA_SETUP, fullName: "", position: "", coreFunctions: [{ duty: "Mine", mfo: "", autofill: false }] });
    const h = await s.header(dev);
    expect(h).toMatchObject({ name: "Dan", position: "" });
    expect(h.core.map((f) => f.duty)).toEqual(["Mine"]);
    expect((await s.header(ana)).core[0].autofill).toBe(true);
  });

  it("fills a row linked to a module with that module's tickets (and everything inside it), the rest elsewhere", async () => {
    const s = darStore(db, now);
    await s.saveProfile(ana.id, {
      ...QA_SETUP,
      coreFunctions: [
        { duty: "Billing UI", mfo: "", autofill: true, areaIds: [bca] },
        { duty: "Other QA", mfo: "", autofill: true },
      ],
      supportFunctions: [],
    });
    const r = await s.load(ana, OCT);
    expect(r.cells.core[0][0]).toBe("Filed #1 T"); // Billing & Collection
    expect(r.cells.core[1][0]).toBe(NO_ENTRY);
    expect(r.cells.core[1][4]).toBe("Replied on & verified #2 T"); // HR-RSP isn't linked to a row
    expect(r.cells.core[0][4]).toBe(NO_ENTRY);
  });

  it("writes an Excel file for a report with no rows yet", async () => {
    const r = await darStore(db, now).load(dev, OCT);
    const files = unzipSync(new Uint8Array(await darXlsx(r)));
    expect(Object.values(files).map((f) => strFromU8(f)).join("\n")).toContain("A.) CORE FUNCTIONS");
  });

  it("writes an Excel file with the header, the days and every row", async () => {
    const s = darStore(db, now);
    const r = await s.load(ana, OCT);
    const files = unzipSync(new Uint8Array(await darXlsx(r, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))));
    const all = Object.values(files).map((f) => strFromU8(f)).join("\n");
    for (const text of ["DAVAO CITY WATER DISTRICT", "Name of PBE :", "Oct 01, 2026 to Oct 15, 2026", "11 Days", "Filed #1 T", "A.) CORE FUNCTIONS", "B.) SUPPORT FUNCTION", "Noted by:"]) {
      expect(all).toContain(text);
    }
    expect(all).toContain("OCT\n1\nTHU");
    expect(all).toMatch(/<mergeCell /); // merged header and label cells
    // Long bond (8.5 × 13 in, Excel paper 14), landscape, fitted to one page, with the workbook's own fills.
    expect(all).toContain('<pageSetup paperSize="14" orientation="landscape" fitToWidth="1" fitToHeight="1"/>');
    expect(all).toContain('<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>');
    expect(all.match(/<pageSetup /g)).toHaveLength(1);
    expect(all).toContain('<pageMargins left="0.5" right="0.5" top="0.5" bottom="0.5" header="0" footer="0"/>');
    expect(all).toMatch(/FFCC99/i);
    expect(all).toMatch(/FBD4B4/i);
    expect(Object.keys(files).some((f) => f.startsWith("xl/media/"))).toBe(true); // the seal
    expect(all).not.toMatch(/<f>/); // no formulas
  });

  it("imports My details with 3rd–17th periods and several MFOs per duty, and replaces the chosen periods", async () => {
    const s = darStore(db, now);
    const NOV = { start: "2026-10-18", end: "2026-11-02" };
    await s.saveProfile(ana.id, {
      ...QA_SETUP,
      periodScheme: "3-18",
      firstPeriodStart: "2026-10-03",
      coreFunctions: [
        { duty: "Design ERP screens", mfo: "Billing UI", autofill: false },
        { duty: "", mfo: "HRM UI", autofill: false, continues: true },
      ],
      supportFunctions: [],
    });
    expect((await s.profile(ana.id))?.periodScheme).toBe("3-18");
    const n = await s.importReports(ana, [{ period: NOV, cells: { core: [["NSC redesign"], ["", "PDS"]], support: [] }, dateSubmitted: "2026-11-04" }]);
    expect(n).toBe(1);
    const r = await s.load(ana, NOV);
    expect(r.saved).toBe(true);
    expect(r.days).toHaveLength(16);
    expect(r.cells.core).toHaveLength(2);
    expect(r.cells.core[0][0]).toBe("NSC redesign");
    expect(r.cells.core[1][1]).toBe("PDS");
    expect(r.dateSubmitted).toBe("2026-11-04");
    expect(r.header.core[1]).toMatchObject({ duty: "", continues: true });

    // The Excel file covers the days into November and merges the duty cell down its two MFO rows.
    const xlsxText = Object.values(unzipSync(new Uint8Array(await darXlsx(r)))).map((f) => strFromU8(f)).join("\n");
    expect(xlsxText).toContain("Oct 18, 2026 to Nov 02, 2026");
    expect(xlsxText).toContain("NOV\n2\nMON");
    expect(xlsxText).toMatch(/<mergeCell ref="A\d+:A\d+"\/>/);
    // Ben's DAR is untouched.
    expect((await s.list(ben.id))).toEqual([]);
  });
});
