import { ScrollToLatest } from "@/components/scroll-to-latest";
import { Card } from "@/components/ui/card";
import type { TicketDetail } from "@/lib/tickets/store";
import { CommentForm } from "@/components/conversation/comment-form";
import { Thread } from "@/components/conversation/conversation";

/** The conversation: the messages and history, opened at the newest, with the reply box at the bottom. */
export function ConversationCard({ t, meId, now }: { t: TicketDetail; meId: string; now: Date }) {
  const ref = { id: t.id, number: t.number };
  // The other side of the conversation, for the reply box's placeholder.
  const replyTo = t.reporterId === meId ? t.assignee?.name : t.reporter.name;
  return (
    <section
      aria-labelledby="talk-title"
      className="desk:min-h-0 desk:flex-1"
    >
      {/* Not clipped, so the Attach menu and the reply's markup dialog aren't cut off.
        Messenger-style, on every screen: the card is one fixed height, as tall as the window allows under the
        top bar (big screens: the rest of the panel), and never grows with the conversation. The messages
        scroll inside it, opened at the newest one, and the reply box stays at the bottom. */}
      <Card className="h-[calc(100dvh-9rem)] min-h-[28rem] overflow-visible max-md:h-[calc(100dvh-8.5rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] max-md:min-h-[22rem] desk:h-full desk:min-h-0">
        <h2
          id="talk-title"
          className="shrink-0 px-5 pt-5 pb-1 text-lg font-semibold"
        >
          Conversation
        </h2>
        <div
          id="ticket-thread"
          tabIndex={0}
          aria-label="Messages and history"
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-4 pb-5 outline-none [scrollbar-gutter:stable] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        >
          <Thread t={t} meId={meId} now={now} />
        </div>
        <ScrollToLatest
          targetId="ticket-thread"
          version={t.lastActivityAt.toISOString()}
        />
        <div
          id="ticket-reply"
          className="max-h-[60%] shrink-0 scroll-mb-5 overflow-y-auto border-t border-line2 px-5 pt-4 pb-5"
        >
          <CommentForm ticket={ref} replyTo={replyTo ?? ""} />
        </div>
      </Card>
    </section>
  );
}
