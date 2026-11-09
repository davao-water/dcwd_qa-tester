import { describe, expect, it } from "vitest";
import type { ProgressArea, ProgressTicket } from "@/lib/tickets/progress";
import { moduleReport, reportHtml } from "@/lib/tickets/report";

const areas: ProgressArea[] = [
  { id: "bill", name: "Billing", parentId: null, active: true },
  { id: "meter", name: "Meter Reading", parentId: "bill", active: true },
  { id: "pay", name: "Payroll <HR>", parentId: null, active: true },
  { id: "old", name: "Old module", parentId: null, active: false },
];

const tk = (over: Partial<ProgressTicket>): ProgressTicket => ({ areaId: "bill", category: "FRONT_END", status: "NEW", ...over });

describe("module report", () => {
  const tickets: ProgressTicket[] = [
    tk({ status: "CLOSED", closedFrom: "VERIFIED" }),
    tk({ areaId: "meter", status: "IN_PROGRESS", category: "BACK_END" }),
    tk({ status: "REOPENED" }),
    tk({ status: "REJECTED" }),
    tk({ areaId: "pay", status: "FIXED", category: null }),
    tk({ areaId: "old", status: "NEW" }),
    tk({ areaId: null, status: "NEED_INFO" }),
  ];
  const r = moduleReport(areas, tickets);

  it("counts every ticket by stage under its top-level module, sub-modules rolled up", () => {
    const bill = r.rows.find((x) => x.id === "bill")!;
    expect(bill.stages).toEqual({ toStart: 1, doing: 1, info: 0, fixed: 0, closed: 1, other: 1, total: 4 });
    // The same score as the dashboard: 1 closed of 3 counted, scored out of at least 5.
    expect(bill.score).toEqual({ done: 1, total: 3, pct: 20 });
    expect(bill.categories.FRONT_END).toEqual({ done: 1, total: 2, pct: 50 });
    const pay = r.rows.find((x) => x.id === "pay")!;
    expect(pay.untagged).toBe(1);
    expect(pay.stages.fixed).toBe(1);
  });

  it("puts tickets with no module or an inactive one in their own row, and totals everything", () => {
    expect(r.rows.map((x) => x.id)).not.toContain("old");
    expect(r.elsewhere).toMatchObject({ toStart: 1, info: 1, total: 2 });
    expect(r.all.total).toBe(7);
    expect(r.overall).toEqual({ done: 1, total: 3, pct: 33 });
  });

  it("renders a printable page that escapes module and person names", () => {
    const html = reportHtml(r, { generatedAt: new Date("2026-11-06T02:00:00Z"), by: `Ana "QA" <script>` });
    expect(html).toContain("Payroll &lt;HR&gt;");
    expect(html).not.toContain("<HR>");
    expect(html).toContain("Ana &quot;QA&quot; &lt;script&gt;");
    expect(html).toContain("window.print()");
    expect(html).toContain("@page { size: A4 landscape");
  });
});
