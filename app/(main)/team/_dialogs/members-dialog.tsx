"use client";

import { useActionState } from "react";
import { UserPlusIcon } from "lucide-react";
import { FormMessage } from "@/components/form-field";
import { FormDialog } from "@/components/form-dialog";
import { Button } from "@/components/ui/button";
import { initialFormState, type FormState } from "@/lib/form";
import { saveAreaMembers } from "../actions";
import { PeoplePicker } from "./people-picker";
import type { MemberValue, PersonOption } from "./types";
import { usePeoplePick } from "./use-people-pick";

/** One area's Members button: tick who works on it, pick the lead, and who works there as UI/UX. */
export function MembersDialog({
  areaId,
  areaName,
  people,
  members,
}: {
  areaId: string;
  areaName: string;
  people: PersonOption[];
  members: MemberValue[];
}) {
  return (
    <FormDialog
      wide
      title={`Members of ${areaName}`}
      description="Tick everyone who works on this area. The lead is the first developer QA should contact. A designer can work here as its UI/UX designer."
      trigger={
        <Button variant="ghost" size="icon-sm" aria-label={`Edit members of ${areaName}`}>
          <UserPlusIcon />
        </Button>
      }
    >
      {(close) => <MembersForm areaId={areaId} people={people} members={members} onDone={close} />}
    </FormDialog>
  );
}

function MembersForm({ areaId, people, members, onDone }: { areaId: string; people: PersonOption[]; members: MemberValue[]; onDone: () => void }) {
  const [state, action, pending] = useActionState(async (prev: FormState, fd: FormData) => {
    const r = await saveAreaMembers(prev, fd);
    if (r.ok) onDone();
    return r;
  }, initialFormState);
  const pick = usePeoplePick(members);

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="areaId" value={areaId} />
      <PeoplePicker people={people} pick={pick} />
      <FormMessage state={state} />
      <div className="flex items-center justify-between gap-3">
        <span className="text-[0.8125rem] text-muted-foreground">{pick.chosen.size} selected{pick.lead ? "" : " · no lead"}</span>
        <div className="flex gap-2">
          {pick.lead ? <Button type="button" variant="ghost" onClick={() => pick.setLead("")}>Clear lead</Button> : null}
          <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save members"}</Button>
        </div>
      </div>
    </form>
  );
}
