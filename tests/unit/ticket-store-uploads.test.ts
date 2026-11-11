import { describe, expect, it } from "vitest";
import { TicketError, ticketStore } from "@/lib/tickets/store";
import { db, now, setClock, qa, dev, dev2, admin, input, ready, img, setUpTicketStoreDb } from "./helpers/ticket-store-db";

// Attachments: who may read them, and the uploads a ticket form claims.

setUpTicketStoreDb();

describe("ticketStore uploads", () => {
  it("gives out a ticket's attachments to anyone who may read tickets", async () => {
    const s = ticketStore(db, now);
    const file = img("c");
    await s.create(qa, input({ assigneeId: dev.id }), [await ready(s, qa, file)]);
    const att = await db.attachment.findFirstOrThrow();
    expect(await s.attachmentFor(qa, att.id)).toMatchObject({ storedName: file.storedName });
    expect(await s.attachmentFor(dev, att.id)).not.toBeNull();
    // Not assigned to them, but readable from the All tab.
    expect(await s.attachmentFor(dev2, att.id)).not.toBeNull();
    expect(await s.attachmentFor(admin, att.id)).not.toBeNull();
    expect(await s.attachmentFor(admin, "missing")).toBeNull();
  });

  it("attaches a finished upload only for the person who uploaded it, once", async () => {
    const s = ticketStore(db, now);
    const vid = (c: string) => ({ kind: "VIDEO" as const, storedName: `2026/10/${c.repeat(32)}.mp4`, originalName: "repro.mp4", mime: "video/mp4", size: 5_000_000, durationSec: 42 });
    const mine = await ready(s, qa, vid("a"));
    const devs = await ready(s, dev, vid("b"));

    // Someone else's upload is refused, and nothing is filed.
    await expect(s.create(qa, input(), [devs])).rejects.toThrow(TicketError);
    expect(await db.ticket.count()).toBe(0);

    const tk = await s.create(qa, input(), [mine]);
    const detail = (await s.get(tk.number, qa))!;
    expect(detail.attachments.map((a) => [a.kind, a.originalName, a.durationSec])).toEqual([["VIDEO", "repro.mp4", 42]]);
    expect(await db.pendingUpload.count({ where: { id: mine } })).toBe(0);
    // Already claimed: can't be attached twice.
    await expect(s.comment(qa, tk.id, "again", [mine])).rejects.toThrow(/expired/);

    // A reply can be just a video.
    await s.assign(qa, tk.id, dev.id);
    await s.comment(dev, tk.id, "", [devs]);
    const after = (await s.get(tk.number, dev))!;
    expect(after.comments[0].attachments.map((a) => a.kind)).toEqual(["VIDEO"]);
    expect(await s.attachmentFor(dev, after.comments[0].attachments[0].id)).toMatchObject({ mime: "video/mp4" });
  });

  it("refuses an upload that hasn't finished, and more than one video or six images", async () => {
    const s = ticketStore(db, now);
    const signed = await s.pending.create(qa, img("f"));
    await expect(s.create(qa, input(), [signed])).rejects.toThrow(/didn't finish/);

    const vid = (c: string) => ({ kind: "VIDEO" as const, storedName: `2026/10/${c.repeat(32)}.mp4`, originalName: "r.mp4", mime: "video/mp4", size: 10 });
    const two = [await ready(s, qa, vid("1")), await ready(s, qa, vid("2"))];
    await expect(s.create(qa, input(), two)).rejects.toThrow(/at most 1 video/);
    const seven = await Promise.all(["3", "4", "5", "6", "7", "8", "9"].map((c) => ready(s, qa, img(c))));
    await expect(s.create(qa, input(), seven)).rejects.toThrow(/at most 6 images/);
    expect(await db.ticket.count()).toBe(0);
  });

  it("limits how many uploads one person may have waiting", async () => {
    const s = ticketStore(db, now);
    for (let i = 0; i < 20; i++) await s.pending.create(qa, img(i.toString(16).padStart(2, "0")));
    await expect(s.pending.create(qa, img("ff"))).rejects.toThrow(/too many files waiting/);
    expect(await s.pending.create(dev, img("ee"))).toBeTruthy();
  });

  it("removes your own pending video and sweeps old ones", async () => {
    const s = ticketStore(db, now);
    const vid = (c: string) => ({ kind: "VIDEO" as const, storedName: `2026/10/${c.repeat(32)}.webm`, originalName: "r.webm", mime: "video/webm", size: 10 });
    const a = await s.pending.create(qa, vid("c"));
    expect(await s.pending.remove(dev, a)).toBeNull();
    expect(await s.pending.remove(qa, a)).toEqual({ storedName: vid("c").storedName });

    await s.pending.create(qa, vid("d"));
    setClock(now().getTime() + 23 * 3_600_000);
    await s.pending.create(qa, vid("e"));
    expect(await s.pending.sweep()).toEqual([]);
    setClock(now().getTime() + 2 * 3_600_000);
    expect(await s.pending.sweep()).toEqual([{ storedName: vid("d").storedName }]);
    expect(await db.pendingUpload.count()).toBe(1);
  });
});
