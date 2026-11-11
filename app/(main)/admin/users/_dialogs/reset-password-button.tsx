"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { KeyRoundIcon } from "lucide-react";
import { closeAllowed, CloseGuardProvider, useCloseGuardRef } from "@/components/close-guard";
import { InlineAlert } from "@/components/inline-alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { resetPassword, type UserFormState } from "../actions";
import { TempPassword } from "./temp-password";

/** The key icon in the user table, or with `labelled` a "Reset password" button (the forgot-password requests). */
export function ResetPasswordButton({ id, name, labelled = false }: { id: string; name: string; labelled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<UserFormState | null>(null);
  const guard = useCloseGuardRef();
  const router = useRouter();

  // The page refreshes only once the dialog is closed: a reset can clear a forgot-password request, and refreshing
  // earlier would remove that request's row, and this dialog with it.
  const close = () => {
    const reset = result?.ok;
    setOpen(false);
    setResult(null);
    if (reset) router.refresh();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next, details) => {
        if (next) return setOpen(true);
        if (!closeAllowed(guard)) return details.cancel();
        close();
      }}
    >
      <DialogTrigger
        render={
          labelled ? (
            <Button size="sm" aria-label={`Reset password for ${name}`}>
              <KeyRoundIcon /> Reset password
            </Button>
          ) : (
            <Button variant="ghost" size="icon-sm" aria-label={`Reset password for ${name}`}>
              <KeyRoundIcon />
            </Button>
          )
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset password for {name}?</DialogTitle>
          <DialogDescription>They’ll be signed out everywhere and must choose a new password at next sign-in.</DialogDescription>
        </DialogHeader>
        {result?.ok && result.tempPassword ? (
          <CloseGuardProvider value={guard}>
            <TempPassword
              email={result.email ?? ""}
              password={result.tempPassword}
              onDone={close}
            />
          </CloseGuardProvider>
        ) : (
          <>
            {result && !result.ok ? <InlineAlert tone="bad" role="alert">{result.message}</InlineAlert> : null}
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
              <Button disabled={pending} onClick={() => startTransition(async () => setResult(await resetPassword(id)))}>
                {pending ? "Resetting…" : "Reset password"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
