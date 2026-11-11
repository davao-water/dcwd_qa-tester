import { describe, expect, it } from "vitest";
import { clip, pushMessage } from "@/lib/push/message";

// What a device notification says.

describe("pushMessage", () => {
  const t = { number: 12, title: "Bill shows the wrong total", type: "BUG" as const, areaName: "Billing", actorName: "Ana", forAssignee: false, previews: true };
  const reply = (text: string, photos = 0, video = false) => ({ kind: "reply" as const, text, photos, video });

  it("leads with the message: ticket title, who wrote what, and the module", () => {
    expect(pushMessage(reply("Can you check the total again?"), t)).toEqual({
      title: "#12 · Bill shows the wrong total",
      body: "Ana: Can you check the total again?\nModule: Billing",
      url: "/tickets/12?tab=conversation",
      tag: "ticket-12",
      stack: { line: "Ana: Can you check the total again?", detail: "Module: Billing" },
    });
  });

  it("cuts long titles and messages to one short line", () => {
    const m = pushMessage(reply("word ".repeat(100)), { ...t, title: "x".repeat(200) });
    expect(m.title.length).toBeLessThanOrEqual("#12 · ".length + 80);
    expect(m.title.endsWith("…")).toBe(true);
    expect(m.body.split("\n")[0].length).toBeLessThanOrEqual(140);
    expect(clip("a\n\n  b", 10)).toBe("a b");
  });

  it("says what's attached", () => {
    expect(pushMessage(reply("", 1), t).body.split("\n")[0]).toBe("Ana: 📷 Photo");
    expect(pushMessage(reply("See these", 3, true), t).body.split("\n")[0]).toBe("Ana: See these 📷 3 photos 🎥 Video");
  });

  it("tells QA a ticket was handed back, with the recommendation, and the reason only with previews on", () => {
    const e = { kind: "handedBack" as const, recommended: "Cy", note: "It's in the payroll code" };
    expect(pushMessage(e, t).body.split("\n")[0]).toBe("Ana handed it back to reassign. Recommends Cy. It's in the payroll code");
    expect(pushMessage(e, { ...t, previews: false }).body.split("\n")[0]).toBe("Ana handed it back to reassign. Recommends Cy.");
    expect(pushMessage({ kind: "handedBack", recommended: null }, t).body.split("\n")[0]).toBe("Ana handed it back to reassign.");
  });

  it("with previews off shows no ticket text at all", () => {
    const m = pushMessage(reply("Account 0123-45 of Juan Dela Cruz"), { ...t, previews: false });
    expect(m.title).toBe("#12 · Bug");
    expect(m.body).toBe("New reply from Ana\nModule: Billing");
    expect(JSON.stringify(m)).not.toMatch(/0123-45|Juan|wrong total/);
    const note = pushMessage({ kind: "status", to: "NEED_INFO", note: "Juan's account" }, { ...t, previews: false });
    expect(note.body).not.toMatch(/Juan/);
  });

  it("describes the other events, the status note only with previews", () => {
    const line = (e: Parameters<typeof pushMessage>[0], over: Partial<typeof t> = {}) => pushMessage(e, { ...t, ...over }).body.split("\n")[0];
    expect(line({ kind: "filed" }, { forAssignee: true })).toBe("Assigned to you by Ana");
    expect(line({ kind: "filed" })).toBe("New ticket from Ana");
    expect(line({ kind: "assigned" }, { forAssignee: true })).toBe("Assigned to you by Ana");
    expect(line({ kind: "assigned" })).toBe("Assignee changed by Ana");
    expect(line({ kind: "assigned", note: "Ben is on leave" }, { forAssignee: true })).toBe("Assigned to you by Ana: Ben is on leave");
    expect(line({ kind: "assigned", note: "Juan's account" }, { forAssignee: true, previews: false })).toBe("Assigned to you by Ana");
    expect(line({ kind: "edited" })).toBe("Edited by Ana");
    expect(line({ kind: "status", to: "NEED_INFO", note: "Which account?" })).toMatch(/^Ana marked it .+: Which account\?$/);
    expect(pushMessage({ kind: "edited" }, { ...t, areaName: null }).body).toBe("Edited by Ana\nModule: none");
    expect(pushMessage({ kind: "edited" }, t).stack).toBeUndefined(); // only replies stack
  });

  it("gives each status change its own notification, while the rest share the ticket's", () => {
    const at = (iso: string) => ({ ...t, at: new Date(iso) });
    const fixed = pushMessage({ kind: "status", to: "FIXED" }, at("2026-11-01T09:00:00Z")).tag;
    const closed = pushMessage({ kind: "status", to: "CLOSED" }, at("2026-11-01T09:05:00Z")).tag;
    expect(fixed).not.toBe(closed);
    expect(fixed.startsWith("ticket-12-")).toBe(true);
    expect(fixed.length).toBeLessThanOrEqual(32); // also the push topic, which allows 32 characters
    expect(pushMessage({ kind: "edited" }, at("2026-11-01T09:00:00Z")).tag).toBe("ticket-12");
  });
});
