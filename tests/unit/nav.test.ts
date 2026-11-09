import { describe, expect, it } from "vitest";
import { backTarget, breadcrumbs, filterNavGroups, isTabRoot, mobileTabFor, mobileTabs, mobileTitle, navGroups } from "@/components/nav";

describe("Search menu", () => {
  const labels = (query: string) => filterNavGroups(navGroups({ role: "ADMIN" }), query).flatMap((g) => g.items.map((i) => i.label));

  it("keeps everything when nothing is typed", () => {
    expect(filterNavGroups(navGroups({ role: "ADMIN" }), "   ")).toEqual(navGroups({ role: "ADMIN" }));
  });

  it("matches any part of a name, in either case", () => {
    expect(labels("TICK")).toEqual(["Tickets"]);
    expect(labels(" team ")).toEqual(["Team & modules"]);
  });

  it("drops a group with no match, and leaves nothing when no item matches", () => {
    expect(filterNavGroups(navGroups({ role: "ADMIN" }), "users").map((g) => g.key)).toEqual(["admin"]);
    expect(filterNavGroups(navGroups({ role: "ADMIN" }), "zzz")).toEqual([]);
  });

  it("shows Users to admins and to anyone lent sign-ups and password requests", () => {
    const keys = (u: Parameters<typeof navGroups>[0]) => navGroups(u).map((g) => g.key);
    expect(keys({ role: "ADMIN" })).toEqual(["tickets", "admin"]);
    expect(keys({ role: "QA" })).toEqual(["tickets"]);
    expect(keys({ role: "QA", grants: ["areas.manage"] })).toEqual(["tickets"]);
    expect(keys({ role: "QA", grants: ["users.requests"] })).toEqual(["tickets", "admin"]);
    expect(keys(null)).toEqual(["tickets"]);
  });
});

describe("breadcrumbs", () => {
  it("names a sidebar page", () => {
    expect(breadcrumbs("/")).toEqual([{ label: "Dashboard" }]);
    expect(breadcrumbs("/tickets")).toEqual([{ label: "Tickets" }]);
    expect(breadcrumbs("/account")).toEqual([{ label: "My account" }]);
  });

  it("links back up from an inner page, with a ticket number in mono", () => {
    expect(breadcrumbs("/tickets/1039")).toEqual([{ label: "Tickets", href: "/tickets" }, { label: "#1039", mono: true }]);
    expect(breadcrumbs("/tickets/new")).toEqual([{ label: "Tickets", href: "/tickets" }, { label: "New ticket" }]);
    expect(breadcrumbs("/dar/setup")).toEqual([{ label: "My DAR", href: "/dar" }, { label: "Set-up" }]);
  });

  it("shows Admin as plain text, since it has no page of its own", () => {
    expect(breadcrumbs("/admin/users")).toEqual([{ label: "Admin" }, { label: "Users" }]);
  });
});

describe("phone navigation", () => {
  it("gives every role the same five tabs, Inbox in the middle as the main one", () => {
    for (const role of ["QA", "DEV", "ADMIN"] as const) {
      const tabs = mobileTabs(role);
      expect(tabs.map((t) => t.label)).toEqual(["Home", "Tickets", "Inbox", "DAR", "Settings"]);
      expect(tabs[2].main).toBe(true);
    }
  });

  it("shows the bottom bar only on a tab's own page", () => {
    for (const p of ["/", "/tickets", "/dar", "/settings"]) expect(isTabRoot(p, false)).toBe(true);
    expect(isTabRoot("/inbox", false)).toBe(true);
    expect(isTabRoot("/inbox", true)).toBe(false); // an open conversation
    for (const p of ["/tickets/12", "/tickets/new", "/dar/setup", "/account", "/team", "/admin/users"]) expect(isTabRoot(p, false)).toBe(false);
  });

  it("lights Settings for the pages reached from it", () => {
    expect(mobileTabFor("/account")).toBe("/settings");
    expect(mobileTabFor("/team")).toBe("/settings");
    expect(mobileTabFor("/admin/users")).toBe("/settings");
    expect(mobileTabFor("/tickets/12")).toBe("/tickets");
    expect(mobileTabFor("/dar/setup")).toBe("/dar");
    expect(mobileTabFor("/")).toBe("/");
  });

  it("goes back up to the parent page, named", () => {
    expect(backTarget("/tickets/12")).toEqual({ href: "/tickets", label: "Tickets" });
    expect(backTarget("/tickets/new")).toEqual({ href: "/tickets", label: "Tickets" });
    expect(backTarget("/dar/setup")).toEqual({ href: "/dar", label: "My DAR" });
    expect(backTarget("/inbox")).toEqual({ href: "/inbox", label: "Inbox" });
    expect(backTarget("/account")).toEqual({ href: "/settings", label: "Settings" });
    expect(backTarget("/admin/users")).toEqual({ href: "/settings", label: "Settings" });
  });

  it("titles inner pages briefly", () => {
    const q = (s = "") => new URLSearchParams(s);
    expect(mobileTitle("/tickets/128", q())).toBe("#128");
    expect(mobileTitle("/inbox", q("t=42"))).toBe("#42");
    expect(mobileTitle("/tickets/new", q())).toBe("New ticket");
    expect(mobileTitle("/account", q("tab=sound"))).toBe("Sound");
    expect(mobileTitle("/account", q())).toBe("My account");
    expect(mobileTitle("/team", q())).toBe("Team & modules");
  });
});
