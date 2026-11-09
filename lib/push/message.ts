import { STATUS_LABELS, TYPE_LABELS, type TicketStatus } from "@/lib/tickets/workflow";

// What a device notification says. With previews on (the default) it leads with the message: the ticket's title, who
// wrote what (cut short, with 📷/🎥 when something is attached) and the module. No photo: each one would be downloaded
// from Storage by every device, and screenshots show customer data. With previews off it shows no ticket text at all, only
// "#12 · Bug / New reply from Ana / Module: Billing", for people whose lock screens others can see.
// The device adds the time itself.

/** What happened, with what's needed to describe it. Replies carry the message and what's attached. */
export type PushEvent =
  | { kind: "filed" }
  | { kind: "assigned"; note?: string | null }
  | { kind: "reply"; text: string; photos: number; video: boolean }
  | { kind: "status"; to: TicketStatus; note?: string | null }
  | { kind: "edited" }
  /** The developer handed it back to QA to reassign (Won't fix → another developer should take it). */
  | { kind: "handedBack"; recommended: string | null; note?: string | null };

/**
 * `tone` is the recipient's sound choice (see tones.ts) and `count` their unread tickets for the app icon, a number with no
 * ticket text, both added per person when it's sent. `stack` lets the service worker merge replies on one ticket (public/sw.js).
 */
export type PushMessage = { title: string; body: string; url: string; tag: string; tone?: string; count?: number; stack?: { line: string; detail: string } };

export type PushTicket = { number: number; title: string; type: keyof typeof TYPE_LABELS; areaName: string | null };

const TITLE_MAX = 80;
const LINE_MAX = 120;

/** One line, cut at `max` characters with "…". */
export function clip(s: string, max: number): string {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > max ? `${one.slice(0, max - 1).trimEnd()}…` : one;
}

/** A tag for this ticket: its replies, edits and assignment share `ticket-12`; each status change gets its own. */
export const ticketTag = (number: number) => `ticket-${number}`;

/** `at` names a status change's own notification, so one about Closed doesn't replace the one about Fixed. */
export function pushMessage(e: PushEvent, t: PushTicket & { actorName: string; forAssignee: boolean; previews: boolean; at?: Date }): PushMessage {
  const a = t.actorName;
  const detail = `Module: ${t.areaName ?? "none"}`;
  let line: string;
  if (e.kind === "reply") {
    if (!t.previews) line = `New reply from ${a}`;
    else {
      const extras = [e.photos ? (e.photos > 1 ? `📷 ${e.photos} photos` : "📷 Photo") : null, e.video ? "🎥 Video" : null].filter(Boolean).join(" ");
      line = clip([`${a}:`, e.text ? clip(e.text, LINE_MAX) : null, extras || null].filter(Boolean).join(" "), LINE_MAX + 20);
    }
  } else if (e.kind === "status") {
    line = `${a} marked it ${STATUS_LABELS[e.to]}${t.previews && e.note ? `: ${clip(e.note, LINE_MAX)}` : ""}`;
  } else if (e.kind === "edited") {
    line = `Edited by ${a}`;
  } else if (e.kind === "handedBack") {
    // The reason is ticket text, so it shows only with previews on; the recommended name always helps QA act.
    const who = e.recommended ? ` Recommends ${e.recommended}.` : "";
    line = `${a} handed it back to reassign.${who}${t.previews && e.note ? ` ${clip(e.note, LINE_MAX)}` : ""}`;
  } else {
    // A reassign reason ("Ben is on leave") is ticket text too, so it shows only with previews on.
    const why = e.kind === "assigned" && t.previews && e.note ? `: ${clip(e.note, LINE_MAX)}` : "";
    line = (t.forAssignee ? `Assigned to you by ${a}` : e.kind === "filed" ? `New ticket from ${a}` : `Assignee changed by ${a}`) + why;
  }
  return {
    title: t.previews ? `#${t.number} · ${clip(t.title, TITLE_MAX)}` : `#${t.number} · ${TYPE_LABELS[t.type]}`,
    body: `${line}\n${detail}`,
    // A reply opens where it can be read and answered; anything else opens the ticket's Details.
    url: `/tickets/${t.number}${e.kind === "reply" ? "?tab=conversation" : ""}`,
    // The same tag replaces an older notification about this ticket instead of piling up. Status changes are the
    // ticket's history (did the developer get to it?), so each one stays as its own notification.
    tag: e.kind === "status" ? `${ticketTag(t.number)}-${(t.at ?? new Date()).getTime().toString(36)}` : ticketTag(t.number),
    ...(e.kind === "reply" ? { stack: { line, detail } } : {}),
  };
}

export const TEST_MESSAGE: PushMessage = { title: "QA Hub", body: "Notifications are on for this device", url: "/account", tag: "test" };
