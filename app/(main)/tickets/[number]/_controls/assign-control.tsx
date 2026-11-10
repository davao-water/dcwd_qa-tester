"use client";

import { Button } from "@/components/ui/button";
import { ArrowRightLeftIcon } from "lucide-react";
import { useState } from "react";
import type { AreaOption, AssigneeOption } from "../../_form/types";
import { AssignForm } from "./assign-form";
import type { Ref } from "./ticket-ref";

/**
 * The Developer box in a ticket's details. With a developer set it shows their name and **Reassign**, which opens the
 * picker and an optional reason for the timeline; with none, the picker shows straight away with **Assign**.
 */
export function AssignControl({
  ticket,
  areas,
  people,
  areaId,
  assigneeId,
  assigneeName,
}: {
  ticket: Ref;
  areas: AreaOption[];
  people: AssigneeOption[];
  areaId: string;
  assigneeId: string;
  assigneeName: string | null;
}) {
  const [open, setOpen] = useState(!assigneeId);

  if (!open) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">{assigneeName ?? "Not assigned"}</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setOpen(true)}
        >
          <ArrowRightLeftIcon /> Reassign
        </Button>
      </div>
    );
  }
  const close = () => setOpen(false);
  return (
    <AssignForm
      ticket={ticket}
      areas={areas}
      people={people}
      areaId={areaId}
      assigneeId={assigneeId}
      onDone={close}
      onCancel={assigneeId ? close : undefined}
    />
  );
}
