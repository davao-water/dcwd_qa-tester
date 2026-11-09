import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { FileSpreadsheetIcon } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { FormSkeleton } from "@/components/skeletons";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireAction } from "@/lib/auth/session";
import { firstPeriodOf, manilaDay, periodFor, schemeOf } from "@/lib/dar/period";
import { darStore } from "@/lib/dar/store";
import { db } from "@/lib/db";
import { ImportDar } from "./import-dar";
import { ticketFormOptions } from "../../tickets/options";
import { DarSetupForm } from "./setup-form";

export const metadata: Metadata = { title: "My DAR set-up" };

const dar = darStore(db);

export default function DarSetupPage() {
  return (
    <>
      <PageHeader
        title="My DAR set-up"
        description="The fixed text on your Daily Accomplishment Report: your name, office, signatories, and the duties and MFOs. Saved once and used for every period."
        actions={
          <Button variant="outline" nativeButton={false} render={<Link href="/dar" />}>
            <FileSpreadsheetIcon /> My DAR
          </Button>
        }
      />
      <Suspense fallback={<FormSkeleton sections={4} />}>
        <SetupBody />
      </Suspense>
    </>
  );
}

async function SetupBody() {
  await connection();
  const me = await requireAction("dar.use");
  const [header, profile, saved, { areas }] = await Promise.all([dar.header(me), dar.profile(me.id), dar.list(me.id), ticketFormOptions()]);
  const today = manilaDay(new Date());
  const scheme = schemeOf(profile?.periodScheme);
  const first = firstPeriodOf(profile?.firstPeriodStart, saved.map((s) => s.periodStart), scheme) ?? periodFor(today, scheme);
  return (
    <div className="grid gap-6">
      <ImportDar savedStarts={saved.map((s) => s.periodStart)} />
      <Card>
        <CardContent>
          {/* Remounted after an import or a save elsewhere, so it shows what is stored now. */}
          <DarSetupForm
            key={profile?.updatedAt.toISOString() ?? "new"}
            header={header}
            hasFullName={!!profile?.fullName}
            firstPeriodStart={first.start}
            scheme={scheme}
            today={today}
            areas={areas}
          />
        </CardContent>
      </Card>
    </div>
  );
}
