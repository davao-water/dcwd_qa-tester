import { describe, expect, it } from "vitest";
import { deviceLabel } from "@/lib/push/device";
import { base64UrlToBytes } from "@/lib/push/key";
import { DEFAULT_TONE, effectiveTone, isTone, toneSrc } from "@/lib/push/tones";
import { webPushSender } from "@/lib/push/web-push";
import { isPushEndpoint, pushSubscriptionInput, workHoursInput } from "@/lib/schemas/push";

// The small push helpers: device names, the push schemas, keys, the sender switch and the tones.

describe("deviceLabel", () => {
  it("names the browser and system", () => {
    expect(deviceLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36 Edg/141.0")).toBe("Edge on Windows");
    expect(deviceLabel("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36")).toBe("Chrome on Android");
    expect(deviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1")).toBe("Safari on iPhone/iPad");
    expect(deviceLabel("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15")).toBe("Safari on Mac");
    expect(deviceLabel("")).toBe("Browser on unknown device");
  });
});

describe("push schemas", () => {
  it("accepts only the browsers' push services over https", () => {
    expect(isPushEndpoint("https://fcm.googleapis.com/fcm/send/abc")).toBe(true);
    expect(isPushEndpoint("https://web.push.apple.com/abc")).toBe(true);
    expect(isPushEndpoint("https://wns2-sg2p.notify.windows.com/w/?token=abc")).toBe(true);
    expect(isPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/abc")).toBe(true);
    expect(isPushEndpoint("http://fcm.googleapis.com/fcm/send/abc")).toBe(false);
    expect(isPushEndpoint("https://evil.example/push.apple.com")).toBe(false);
    expect(isPushEndpoint("https://push.apple.com.evil.example/x")).toBe(false);
    expect(isPushEndpoint("not a url")).toBe(false);
  });

  it("needs both keys", () => {
    expect(pushSubscriptionInput.safeParse({ endpoint: "https://fcm.googleapis.com/fcm/send/a", keys: { p256dh: "p", auth: "a" } }).success).toBe(true);
    expect(pushSubscriptionInput.safeParse({ endpoint: "https://fcm.googleapis.com/fcm/send/a", keys: { p256dh: "p" } }).success).toBe(false);
  });

  it("turns times and days into minutes and a bitmask", () => {
    const r = workHoursInput.safeParse({ offHoursPush: "NONE", workStartMin: "07:30", workEndMin: "17:00", days: [1, 2, 3, 4, 5] });
    expect(r.success && r.data).toEqual({ offHoursPush: "NONE", workStartMin: 450, workEndMin: 1020, workDays: 62 });
    expect(workHoursInput.safeParse({ offHoursPush: "NONE", workStartMin: "08:00", workEndMin: "08:00", days: [1] }).success).toBe(false);
    expect(workHoursInput.safeParse({ offHoursPush: "NONE", workStartMin: "08:00", workEndMin: "17:00", days: [] }).success).toBe(false);
    expect(workHoursInput.safeParse({ offHoursPush: "NONE", workStartMin: "25:00", workEndMin: "17:00", days: [1] }).success).toBe(false);
    // "Notify me silently" is no longer a choice (D7).
    expect(workHoursInput.safeParse({ offHoursPush: "SILENT", workStartMin: "07:30", workEndMin: "17:00", days: [1] }).success).toBe(false);
  });
});

describe("base64UrlToBytes", () => {
  it("decodes URL-safe base64 without padding", () => {
    expect(Array.from(base64UrlToBytes("-_8"))).toEqual([0xfb, 0xff]);
    expect(Array.from(base64UrlToBytes("AQID"))).toEqual([1, 2, 3]);
  });
});

describe("webPushSender", () => {
  it("is off until all three VAPID settings are there", () => {
    expect(webPushSender({ NEXT_PUBLIC_VAPID_PUBLIC_KEY: "a", VAPID_PRIVATE_KEY: "b" })).toBeNull();
  });
});

describe("tones", () => {
  it("knows the valid choices", () => {
    expect(isTone("tone-1")).toBe(true);
    expect(isTone("tone-11")).toBe(true);
    expect(isTone("tone-12")).toBe(false);
    expect(isTone("silent")).toBe(true);
    expect(isTone("custom")).toBe(false);
  });

  it("plays presets from /sounds", () => {
    expect(toneSrc("tone-3")).toBe("/sounds/tone-3.mp3");
    expect(toneSrc("custom")).toBeNull();
    expect(toneSrc("silent")).toBeNull();
    expect(toneSrc("../../etc/passwd")).toBeNull();
  });

  it("falls back to the default for anything that isn't in the list", () => {
    expect(effectiveTone({ notifyTone: "custom" })).toBe(DEFAULT_TONE);
    expect(effectiveTone({ notifyTone: "tone-4" })).toBe("tone-4");
  });
});
