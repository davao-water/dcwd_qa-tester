"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useState, useTransition } from "react";
import { CheckIcon, TriangleAlertIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { closeAllowed, CloseGuardProvider, useCloseGuardRef } from "@/components/close-guard";
import { InlineAlert } from "@/components/inline-alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { approveSignUp, dismissResetRequest, rejectSignUp, type UserFormState } from "../actions";
import { ResetPasswordButton } from "../_dialogs/reset-password-button";
import { TempPassword } from "../_dialogs/temp-password";

// Approving or rejecting moves the request out of the Approval list as soon as the page refreshes, which would take a
// dialog inside that row with it, temporary password and all. So the dialogs live in ApprovalHost, which wraps the
// whole page and stays mounted while the list changes underneath it.

/**
 * A sign-up waiting for approval. `claim`: its browser remembers it and gets the temporary password itself after
 * approval. False for a request made before that, which gets a temporary password here, for the admin to hand over.
 */
export type SignUpRequest = { id: string; name: string; email: string; role: string; claim: boolean };
type Open = { request: SignUpRequest; kind: "approve" | "reject" };
const ApprovalContext = createContext<((o: Open) => void) | null>(null);

export function ApprovalHost({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState<Open | null>(null);
  const [result, setResult] = useState<UserFormState | null>(null);
  const [pending, startTransition] = useTransition();
  const guard = useCloseGuardRef();
  const router = useRouter();
  const r = open?.request;

  const close = () => {
    const done = result?.ok;
    setOpen(null);
    setResult(null);
    if (done) router.refresh();
  };

  const approve = () =>
    r &&
    startTransition(async () => {
      const res = await approveSignUp(r.id);
      // Their browser gets the temporary password itself: nothing to hand over, so say so and close.
      if (res.ok && !res.tempPassword) {
        toast.success(`${r.name} can now get their temporary password on the sign-in page.`);
        setOpen(null);
        setResult(null);
        router.refresh();
        return;
      }
      setResult(res);
    });

  const reject = () =>
    r &&
    startTransition(async () => {
      const res = await rejectSignUp(r.id);
      if (res.ok) {
        toast(`${r.name} was rejected.`);
        setOpen(null);
        setResult(null);
        return;
      }
      setResult(res);
    });

  return (
    <ApprovalContext.Provider value={setOpen}>
      {children}
      <Dialog
        open={open !== null}
        onOpenChange={(next, details) => {
          if (next) return;
          if (!closeAllowed(guard)) return details.cancel();
          close();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5">
              <span className={open?.kind === "reject" ? "flex size-9 items-center justify-center rounded-lg bg-bad-t text-destructive-text" : "flex size-9 items-center justify-center rounded-lg bg-warn-t text-warn-ink"} aria-hidden>
                {open?.kind === "reject" ? <XIcon className="size-5" /> : <TriangleAlertIcon className="size-5" />}
              </span>
              {open?.kind === "reject" ? `Reject ${r?.name}?` : `Approve ${r?.name}?`}
            </DialogTitle>
            <DialogDescription>
              {open?.kind === "reject" ? (
                "This deletes their request. They can sign up again later if it was a mistake."
              ) : r && !r.claim ? (
                "This request was made before the sign-in page gave out temporary passwords, so QA Hub creates one for you to give them. They choose their own at first sign-in."
              ) : (
                <>
                  Check the email below is theirs. They will sign in as <strong className="font-semibold text-foreground">{r?.role}</strong>, and get their
                  temporary password on the sign-in page of the browser they signed up on.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          {r ? <p className="font-mono text-sm break-all">{r.email}</p> : null}
          {result?.ok && result.tempPassword ? (
            <CloseGuardProvider value={guard}>
              <TempPassword email={result.email ?? ""} password={result.tempPassword} onDone={close} />
            </CloseGuardProvider>
          ) : (
            <>
              {result && !result.ok ? <InlineAlert tone="bad" role="alert">{result.message}</InlineAlert> : null}
              <DialogFooter>
                <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
                {open?.kind === "reject" ? (
                  <Button variant="destructive" disabled={pending} onClick={reject}>
                    {pending ? "Rejecting…" : "Yes, reject"}
                  </Button>
                ) : (
                  <Button disabled={pending} onClick={approve}>
                    {pending ? "Approving…" : r && !r.claim ? "Approve and create password" : "Yes, approve"}
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </ApprovalContext.Provider>
  );
}

/** Approve or reject one sign-up. Both ask first (D9); approving an older request creates a temporary password. */
export function PendingActions({ request }: { request: SignUpRequest }) {
  const openDialog = useContext(ApprovalContext);
  return (
    <div className="flex items-center justify-end gap-1.5">
      <Button size="sm" variant="soft" onClick={() => openDialog?.({ request, kind: "approve" })} aria-label={`Approve ${request.name}`}>
        <CheckIcon /> Approve
      </Button>
      <Button size="sm" variant="ghost-red" onClick={() => openDialog?.({ request, kind: "reject" })} aria-label={`Reject ${request.name}`}>
        <XIcon /> Reject
      </Button>
    </div>
  );
}

/** A forgot-password request: reset (shows the temporary password to hand over) or dismiss it. */
export function ResetRequestActions({ id, name }: { id: string; name: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const dismiss = () =>
    startTransition(async () => {
      const r = await dismissResetRequest(id);
      setError(r.ok ? null : (r.message ?? "Something went wrong."));
    });

  return (
    <div className="flex items-center justify-end gap-1.5">
      {error ? <span role="alert" className="mr-2 text-[0.7813rem] text-destructive-text">{error}</span> : null}
      <ResetPasswordButton id={id} name={name} labelled />
      <Button size="sm" variant="ghost-red" disabled={pending} onClick={dismiss} aria-label={`Dismiss the request from ${name}`}>
        <XIcon /> Dismiss
      </Button>
    </div>
  );
}
