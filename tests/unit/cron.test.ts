import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cronAuthorized, dailyCleanup } from "@/lib/cron";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { createTestDb } from "./helpers/test-db";

let db: PrismaClient;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
});

afterAll(async () => {
  await cleanup();
});

describe("cronAuthorized", () => {
  const secret = "s3cret-s3cret-s3cret";

  it("accepts only the exact bearer secret", () => {
    expect(cronAuthorized(`Bearer ${secret}`, secret)).toBe(true);
    expect(cronAuthorized(secret, secret)).toBe(false);
    expect(cronAuthorized(`Bearer ${secret}x`, secret)).toBe(false);
    expect(cronAuthorized(null, secret)).toBe(false);
  });

  it("refuses everything when no secret, or a short one, is configured", () => {
    expect(cronAuthorized("Bearer ", undefined)).toBe(false);
    expect(cronAuthorized("Bearer ", "")).toBe(false);
    expect(cronAuthorized("Bearer short", "short")).toBe(false);
  });
});

describe("dailyCleanup", () => {
  it("removes stale uploads, expired sessions and old rate-limit hits, and keeps the rest", async () => {
    const now = new Date("2026-10-30T18:00:00Z");
    const ago = (h: number) => new Date(now.getTime() - h * 3_600_000);
    const u = await db.user.create({ data: { name: "Ana", email: "ana@x.ph", passwordHash: "x", role: "QA" } });
    const file = (c: string, createdAt: Date) => ({ uploaderId: u.id, kind: "IMAGE" as const, storedName: `2026/10/${c.repeat(32)}.png`, originalName: "x.png", mime: "image/png", size: 5, createdAt });
    await db.pendingUpload.createMany({ data: [file("a", ago(25)), file("b", ago(1))] });
    await db.session.createMany({
      data: [
        { id: "old", userId: u.id, expiresAt: ago(1) },
        { id: "live", userId: u.id, expiresAt: new Date(now.getTime() + 3_600_000) },
      ],
    });
    await db.rateLimitHit.createMany({ data: [{ key: "login:x", at: ago(25) }, { key: "login:y", at: ago(1) }] });

    const r = await dailyCleanup(db, now);
    expect(r.staleFiles).toEqual([`2026/10/${"a".repeat(32)}.png`]);
    expect(r.removed).toEqual({ uploads: 1, sessions: 1, rateLimitHits: 1, tempAccess: 0 });
    expect(await db.pendingUpload.count()).toBe(1);
    expect((await db.session.findMany()).map((s) => s.id)).toEqual(["live"]);
    expect((await db.rateLimitHit.findMany()).map((h) => h.key)).toEqual(["login:y"]);
  });
});
