"use client";

import { useCallback, useState } from "react";
import { CheckIcon, CopyIcon, EyeIcon, EyeOffIcon } from "lucide-react";
import { useCloseGuard } from "@/components/close-guard";
import { InlineAlert } from "@/components/inline-alert";
import { Button } from "@/components/ui/button";
import { copyText } from "./copy-text";

/** The one-time temporary password, hidden until the admin chooses to show it, with a copy button that works either way. */
export function TempPassword({ email, password, onDone }: { email: string; password: string; onDone: () => void }) {
  const [shown, setShown] = useState(false);
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");
  const [confirming, setConfirming] = useState(false);
  const doCopy = async () => setCopy((await copyText(password)) ? "copied" : "failed");

  // Closing before the password was copied or shown would lose it for good, so ask first: on Done, and through the
  // dialog's own close (X, Esc, a click outside).
  const secured = shown || copy === "copied";
  const check = useCallback(() => {
    if (secured) return true;
    setConfirming(true);
    return false;
  }, [secured]);
  useCloseGuard(check);

  if (confirming) {
    return (
      <div className="grid gap-4">
        <InlineAlert tone="warn" role="alert">
          <span className="font-semibold">You haven&apos;t copied the password yet.</span> Once this box is closed it can&apos;t be shown again, and
          you&apos;d have to reset the password to get a new one.
        </InlineAlert>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onDone}>Close anyway</Button>
          <Button type="button" onClick={() => setConfirming(false)} autoFocus>Go back to the password</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <InlineAlert tone="ok" role="status">
        Give these sign-in details to the user. The password is shown only once and isn&apos;t emailed, so copy it now.
      </InlineAlert>
      <dl className="grid gap-3 rounded-[0.625rem] border border-line bg-surface2 p-4 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Email</dt>
          <dd className="truncate font-mono">{email}</dd>
        </div>
        <div className="grid gap-2">
          <dt className="text-muted-foreground">Temporary password</dt>
          <dd className="flex items-center gap-1.5">
            <span
              className="flex h-10 min-w-0 flex-1 items-center rounded-lg border border-line bg-card px-3 font-mono text-base font-semibold tracking-wider select-all"
              aria-label={shown ? `Temporary password ${password.split("").join(" ")}` : "Temporary password, hidden"}
            >
              {shown ? password : "•".repeat(password.length)}
            </span>
            <Button type="button" variant="outline" size="sm" onClick={() => setShown(!shown)} aria-pressed={shown} className="h-10">
              {shown ? <EyeOffIcon /> : <EyeIcon />} {shown ? "Hide" : "Show"}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={doCopy} className="h-10">
              {copy === "copied" ? <CheckIcon className="text-ok" /> : <CopyIcon />} {copy === "copied" ? "Copied" : "Copy"}
            </Button>
          </dd>
          <p role="status" className="text-[0.7813rem] text-muted-foreground">
            {copy === "copied"
              ? "Copied to the clipboard. Paste it to the user, then clear it from wherever you pasted it."
              : copy === "failed"
                ? "This browser blocked copying. Click Show, then select the password and press Ctrl+C."
                : null}
          </p>
        </div>
      </dl>
      <div className="flex justify-end">
        <Button type="button" onClick={() => check() && onDone()}>Done</Button>
      </div>
    </div>
  );
}
