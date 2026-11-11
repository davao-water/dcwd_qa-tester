import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { FormSkeleton } from "@/components/skeletons";
import { can } from "@/lib/auth/permissions";
import { requireAction } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { ticketFormOptions } from "@/lib/tickets/form-options";
import { TicketForm } from "../ticket-form";

export const metadata: Metadata = { title: "New ticket" };

export default function NewTicketPage() {
  return (
    // From xl the form fills the window, so the page doesn't scroll: 12.5rem is the top bar and the page's padding (app/(main)/layout.tsx).
    <div className="grid grid-cols-1 gap-6 xl:flex xl:h-[calc(100dvh-12.5rem)] xl:min-h-112 xl:flex-col">
      <PageHeader title="New ticket" description="Report a bug, or suggest an improvement to the ERP. The developer you pick finds it under Assigned to me." />
      <Suspense fallback={<FormSkeleton sections={3} />}>
        <NewTicket />
      </Suspense>
    </div>
  );
}

async function NewTicket() {
  await connection();
  const me = await requireAction("tickets.create");
  const { areas, people } = await ticketFormOptions(db);
  return <TicketForm areas={areas} people={people} canAssign={can(me, "tickets.assign")} draftUserId={me.id} />;
}
