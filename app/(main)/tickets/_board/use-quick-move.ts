"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { initialFormState } from "@/lib/form";
import { STATUS_LABELS, type Transition } from "@/lib/tickets/workflow";
import { moveTicket } from "../actions";
import { stillPending, without, withPending } from "./pending";
import type { BoardCard, BoardColumnData, Pending } from "./types";

/** How long a dropped card waits, with Undo, before the move is saved and people are notified. */
const UNDO_MS = 5000;

/**
 * A drop that needs no note: the card moves at once, with a few seconds to Undo, and is saved after. Returns the
 * columns with those drops already in place.
 */
export function useQuickMove(fromServer: BoardColumnData[]) {
  const [pending, setPending] = useState<Record<string, Pending>>({});
  // Fresh data from the server: forget the drops it now shows (or that someone else's change overtook).
  const [seen, setSeen] = useState(fromServer);
  if (seen !== fromServer) {
    setSeen(fromServer);
    setPending((p) => stillPending(p, fromServer));
  }
  const columns = withPending(fromServer, pending);
  // Drops still in their Undo time, each with a token so a late callback from an older drop of the same card does
  // nothing. Closing the tab now would lose them, so the browser asks first.
  const unsent = useRef(new Map<string, object>());
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (unsent.current.size) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  /** Moves the card now, and saves the move once the Undo toast closes without Undo. */
  const quickMove = (card: BoardCard, m: Transition) => {
    const token = {};
    unsent.current.set(card.id, token);
    setPending((p) => ({ ...p, [card.id]: { from: card.status, to: m.to } }));
    const forget = () => setPending((p) => without(p, card.id));
    const fail = (message: string) => {
      forget();
      toast.error(`#${card.number} wasn't moved`, { description: message });
    };
    const save = () => {
      if (unsent.current.get(card.id) !== token) return; // undone, or already saving
      unsent.current.delete(card.id);
      const fd = new FormData();
      fd.set("id", card.id);
      fd.set("number", String(card.number));
      fd.set("to", m.to);
      moveTicket(initialFormState, fd).then(
        (r) =>
          r.ok
            ? undefined
            : fail(r.message ?? "Refresh the page and try again."),
        () => fail("Check your connection and try again."),
      );
    };
    toast(`Moved #${card.number} to ${STATUS_LABELS[m.to]}`, {
      duration: UNDO_MS,
      action: {
        label: "Undo",
        onClick: () => {
          if (unsent.current.get(card.id) !== token) return;
          unsent.current.delete(card.id);
          forget();
        },
      },
      onAutoClose: save,
      onDismiss: save,
    });
  };

  return { columns, quickMove };
}
