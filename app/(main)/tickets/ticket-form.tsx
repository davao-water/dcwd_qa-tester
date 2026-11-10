"use client";

import { useEffect, useRef, useState } from "react";
import { draftKey, guessDevice, isDeviceType, parseDraft, type TicketDraft } from "@/lib/tickets/draft";
import { takeSharedFiles } from "@/lib/tickets/shared-files";
import type { DeviceType } from "@/lib/tickets/workflow";
import { TicketFormFields } from "./_form/ticket-form-fields";
import { DEVICE_KEY, storage } from "./_form/storage";
import type { SharedFiles, TicketFormProps } from "./_form/types";

/** New ticket (no `ticket`) or edit an existing one. */
export function TicketForm(props: TicketFormProps) {
  const { ticket, draftUserId } = props;
  // Browser storage only exists after hydration, so a draft fills the form by starting it again with those values.
  const [restored, setRestored] = useState<{ run: number; draft: TicketDraft | null }>({ run: 0, draft: null });
  const [defaultDevice, setDefaultDevice] = useState<DeviceType | "">("");
  const [shared, setShared] = useState<SharedFiles | null>(null);
  const loaded = useRef(false);
  const sent = useRef(false);

  useEffect(() => {
    if (ticket) return;
    queueMicrotask(() => {
      // Next keeps a page's state when you move away and runs this again on the way back. Open work stays as it is,
      // unless it was filed meanwhile (its draft is gone): then this is a new ticket, not the old one again.
      if (loaded.current) {
        let waiting = false;
        storage((s) => {
          waiting = !!draftUserId && !!s.getItem(draftKey(draftUserId));
        });
        if (sent.current && !waiting) {
          sent.current = false;
          setRestored((r) => ({ run: r.run + 1, draft: null }));
        }
        return;
      }
      loaded.current = true;
      let remembered: string | null = null;
      storage((s) => {
        remembered = s.getItem(DEVICE_KEY);
        if (!draftUserId) return;
        const raw = s.getItem(draftKey(draftUserId));
        const draft = parseDraft(raw, Date.now());
        if (draft) setRestored({ run: 1, draft });
        // Too old to use: nothing typed stays on the phone any longer.
        else if (raw) s.removeItem(draftKey(draftUserId));
      });
      setDefaultDevice(isDeviceType(remembered) ? remembered : guessDevice(navigator.userAgent, navigator.maxTouchPoints));
      // Share → QA Hub: collected here, after the draft is settled, because restoring one starts the fields again. Whatever
      // the address says: signing in can land somewhere else first, and the file should still be here when they come.
      const url = new URL(window.location.href);
      const share = url.searchParams.get("shared");
      if (share) {
        url.searchParams.delete("shared");
        window.history.replaceState(null, "", url);
      }
      ("caches" in window ? takeSharedFiles() : Promise.resolve([])).then(
        (files) => {
          if (files.length || share) setShared({ files });
        },
        () => {
          if (share) setShared({ files: [] });
        },
      );
    });
  }, [ticket, draftUserId]);

  function clearDraft() {
    if (draftUserId) storage((s) => s.removeItem(draftKey(draftUserId)));
    setRestored((r) => ({ run: r.run + 1, draft: null }));
  }

  return <TicketFormFields key={restored.run} {...props} restored={restored.draft} defaultDevice={defaultDevice} shared={shared} onSharedUsed={() => setShared(null)} onClearDraft={clearDraft} onSending={(sending) => (sent.current = sending)} />;
}
