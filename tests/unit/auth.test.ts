import { describe, expect, it } from "vitest";
import { generateTempPassword, hashPassword, verifyPassword } from "@/lib/auth/password";
import { ACTIONS, can, isRole, ROLES, type Action, type Role } from "@/lib/auth/permissions";
import { safeNext } from "@/lib/auth/safe-next";
import { hashToken, newToken } from "@/lib/auth/store";

describe("password hashing", () => {
  it("verifies the right password and rejects others", async () => {
    const h = await hashPassword("correct horse battery");
    expect(h).toMatch(/^scrypt\$16384\$8\$1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
    expect(await verifyPassword("correct horse battery", h)).toBe(true);
    expect(await verifyPassword("correct horse batterY", h)).toBe(false);
    expect(await verifyPassword("", h)).toBe(false);
  });

  it("salts every hash", async () => {
    expect(await hashPassword("same")).not.toBe(await hashPassword("same"));
  });

  it("treats Unicode lookalike forms as the same password", async () => {
    const h = await hashPassword("ﬁlipino"); // ligature ﬁ normalizes to "fi" under NFKC
    expect(await verifyPassword("filipino", h)).toBe(true);
  });

  it.each(["", "plain", "bcrypt$x$y", "scrypt$16384$8$1$$", "scrypt$16384$8$1$c2FsdA==$"])("rejects malformed stored hash %j", async (stored) => {
    expect(await verifyPassword("anything", stored)).toBe(false);
  });

  it("makes readable temporary passwords", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const p = generateTempPassword();
      expect(p).toMatch(/^[a-km-zA-HJ-NP-Z2-9]{12}$/);
      expect(p).not.toMatch(/[0O1lI]/);
      seen.add(p);
    }
    expect(seen.size).toBe(50);
  });
});

describe("session tokens", () => {
  it("are random and only their SHA-256 is stored", () => {
    const a = newToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newToken()).not.toBe(a);
    expect(hashToken(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(a)).toBe(hashToken(a));
    expect(hashToken(a)).not.toBe(a);
  });
});

describe("permissions", () => {
  const expected: Record<Action, Role[]> = {
    "team.view": ["ADMIN", "QA", "DEV"],
    "tickets.view": ["ADMIN", "QA", "DEV"],
    "tickets.viewAll": ["ADMIN"],
    "tickets.create": ["ADMIN", "QA"],
    "tickets.delete": ["ADMIN", "QA"],
    "tickets.comment": ["ADMIN", "QA", "DEV"],
    "tickets.assign": ["ADMIN", "QA"],
    "tickets.resolve": ["ADMIN", "DEV"],
    "tickets.verify": ["ADMIN", "QA"],
    "areas.manage": ["ADMIN"],
    "users.manage": ["ADMIN"],
    "projects.manage": ["ADMIN"],
    "workspace.manage": ["ADMIN"],
    "dar.use": ["QA", "DEV", "ADMIN"],
    "tickets.categorize": ["ADMIN", "DEV"],
    "designs.create": [],
    "designs.viewAll": ["ADMIN"],
  };

  it("lets the Designer tick-box send designs on top of any role, and nothing else", () => {
    for (const role of ROLES) {
      expect(can({ role, designer: true }, "designs.create")).toBe(true);
      expect(can({ role, designer: false }, "designs.create")).toBe(false);
      for (const a of ACTIONS.filter((x) => x !== "designs.create")) expect(can({ role, designer: true }, a)).toBe(can({ role }, a));
    }
  });

  it("lets the Team Lead tick-box manage Team & modules on top of any role, but never Users", () => {
    for (const role of ROLES) {
      expect(can({ role, teamLead: true }, "areas.manage")).toBe(true);
      expect(can({ role, teamLead: true }, "users.manage")).toBe(role === "ADMIN");
      for (const a of ACTIONS.filter((x) => x !== "areas.manage")) expect(can({ role, teamLead: true }, a)).toBe(can({ role }, a));
    }
    expect(can({ role: "QA", teamLead: false }, "areas.manage")).toBe(false);
    expect(can({ role: "DEV" }, "areas.manage")).toBe(false);
  });

  it("covers every action in the matrix", () => {
    expect([...ACTIONS].sort()).toEqual(Object.keys(expected).sort());
  });

  it.each(ACTIONS.flatMap((a) => ROLES.map((r) => [a, r] as const)))("%s for %s", (action, role) => {
    expect(can({ role }, action)).toBe(expected[action].includes(role));
  });

  it("denies a signed-out visitor everything", () => {
    for (const a of ACTIONS) {
      expect(can(null, a)).toBe(false);
      expect(can(undefined, a)).toBe(false);
    }
  });

  it("recognizes roles", () => {
    expect(isRole("QA")).toBe(true);
    expect(isRole("qa")).toBe(false);
    expect(isRole("OWNER")).toBe(false);
    expect(isRole(undefined)).toBe(false);
  });
});

describe("safeNext", () => {
  it.each([
    ["/", "/"],
    ["/team?person=x", "/team?person=x"],
    ["/admin/users", "/admin/users"],
  ])("keeps same-site path %j", (input, out) => {
    expect(safeNext(input)).toBe(out);
  });

  it.each(["", null, undefined, "https://evil.example", "//evil.example", "/\\evil.example", "/\t/evil.example", "/\n/evil.example", "javascript:alert(1)", "team"])(
    "falls back to / for %j",
    (input) => {
      expect(safeNext(input)).toBe("/");
    },
  );
});
