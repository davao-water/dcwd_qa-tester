"use client";

import { useState, useTransition } from "react";
import { LogOutIcon } from "lucide-react";
import { InlineAlert } from "@/components/inline-alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { FormState } from "@/lib/form";
import { signOutAllDevices } from "../actions";

/** A lost phone: ends all of this person's sessions and stops their device notifications. Their password stays. */
export function SignOutDevicesButton({ id, name }: { id: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<FormState | null>(null);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setResult(null);
      }}
    >
      <DialogTrigger
        render={
          <Button variant="ghost" size="icon-sm" aria-label={`Sign out all devices for ${name}`} title="Sign out all devices">
            <LogOutIcon />
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sign out all devices for {name}?</DialogTitle>
          <DialogDescription>Use this for a lost phone. They&apos;ll be signed out everywhere and device notifications stop. They can sign in again with the same password, then turn notifications back on.</DialogDescription>
        </DialogHeader>
        {result?.ok ? <InlineAlert tone="ok" role="status">{name} is signed out on all devices.</InlineAlert> : null}
        {result && !result.ok ? <InlineAlert tone="bad" role="alert">{result.message}</InlineAlert> : null}
        <DialogFooter>
          {result?.ok ? (
            <DialogClose render={<Button />}>Done</DialogClose>
          ) : (
            <>
              <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
              <Button disabled={pending} onClick={() => startTransition(async () => setResult(await signOutAllDevices(id)))}>
                {pending ? "Signing out…" : "Sign out all devices"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
