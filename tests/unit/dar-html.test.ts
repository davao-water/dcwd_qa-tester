import { describe, expect, it } from "vitest";
import { buildCells, REST_DAY } from "@/lib/dar/autofill";
import { darHtml } from "@/lib/dar/html";
import { periodDays } from "@/lib/dar/period";
import type { DarReportData } from "@/lib/dar/store";
import { LEGACY_TEMPLATE, resolveHeader } from "@/lib/dar/template";
import { profile } from "./helpers/dar-profile";

// darHtml: the printable report.

describe("darHtml", () => {
  it("merges a duty's number and cell down its MFO rows", () => {
    const period = { start: "2026-10-18", end: "2026-11-02" };
    const days = periodDays(period);
    const coreFunctions = [
      { duty: "Design ERP screens", mfo: "Billing UI", autofill: false },
      { duty: "", mfo: "HRM UI", autofill: false, continues: true },
      { duty: "QA testing", mfo: "Reports", autofill: false },
    ];
    const header = resolveHeader(profile({ coreFunctions }), { name: "x" });
    const r: DarReportData = { period, days, header, cells: buildCells(header, days.map(() => "")), dateSubmitted: "2026-11-04", daysAttended: 0, saved: false, status: {}, auto: { core: [], support: [] }, workDays: 62 };
    const html = darHtml(r);
    expect(html).toContain('<td class="n" rowspan="2">1</td><td class="duty" rowspan="2">Design ERP screens</td><td class="mfo">Billing UI</td>');
    expect(html).toContain('<tr><td class="mfo">HRM UI</td>');
    expect(html).toContain('<td class="n">2</td><td class="duty">QA testing</td>');
    expect(html).toContain("Oct 18, 2026 to Nov 02, 2026");
  });

  it("escapes everything typed", () => {
    const period = { start: "2026-10-01", end: "2026-10-15" };
    const days = periodDays(period);
    const header = resolveHeader(profile({ fullName: "<b>Ana</b>", coreFunctions: LEGACY_TEMPLATE.coreFunctions }), { name: "x" });
    const cells = buildCells(header, days.map(() => REST_DAY));
    cells.core[0][0] = `<script>alert(1)</script>`;
    const r: DarReportData = { period, days, header, cells, dateSubmitted: "2026-10-16", daysAttended: 1, saved: false, status: {}, auto: { core: [], support: [] }, workDays: 62 };
    const html = darHtml(r, { seal: `"><script>` });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("&lt;b&gt;Ana&lt;/b&gt;");
    expect(html).toContain("Oct 01, 2026 to Oct 15, 2026");
    expect(html).toContain("October 16, 2026");
    expect(html).toContain("1 Days");
    // Long bond paper and the DCWD workbook's colours.
    expect(html).toContain("size: 13in 8.5in");
    expect(html).toContain("print-color-adjust: exact"); // keep the fills when printing
    // No room for the browser's own headers and footers; the margin is even padding instead.
    expect(html).toContain("margin: 0; }");
    expect(html).toContain("padding: 0.5in");
    expect(html).toContain("background: #ffcc99");
    expect(html).toContain('<th class="core" colspan="2">A.) CORE FUNCTIONS</th>');
    expect(html).toContain("background: #fbd4b4");
    expect(html).toContain("color: #808000");
  });
});
