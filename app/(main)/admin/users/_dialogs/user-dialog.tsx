"use client";

import { useActionState } from "react";
import { PencilIcon, PlusIcon } from "lucide-react";
import { Field, FormMessage } from "@/components/form-field";
import { SelectField } from "@/components/select-field";
import { FormDialog } from "@/components/form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ROLE_LABELS, ROLES, type Role } from "@/lib/auth/permissions";
import { initialFormState } from "@/lib/form";
import { NICKNAME_MAX } from "@/lib/schemas/user";
import { createUser, updateUser, type UserFormState } from "../actions";
import { TempPassword } from "./temp-password";

type UserValues = { id: string; name: string; email: string; role: Role; designer: boolean; teamLead: boolean; active: boolean };

/** New user (the header button) or Edit user (the pencil on a row). A new user's temporary password shows afterwards. */
export function UserDialog({ user, isSelf }: { user?: UserValues; isSelf?: boolean }) {
  return (
    <FormDialog
      title={user ? "Edit user" : "New user"}
      description={user ? undefined : "They'll get a temporary password to change at first sign-in."}
      trigger={
        user ? (
          <Button variant="ghost" size="icon-sm" aria-label={`Edit ${user.name}`}>
            <PencilIcon />
          </Button>
        ) : (
          <Button>
            <PlusIcon /> New user
          </Button>
        )
      }
    >
      {(close) => <UserForm user={user} isSelf={isSelf} onDone={close} />}
    </FormDialog>
  );
}

function UserForm({ user, isSelf, onDone }: { user?: UserValues; isSelf?: boolean; onDone: () => void }) {
  const [state, action, pending] = useActionState(async (prev: UserFormState, fd: FormData) => {
    const r = user ? await updateUser(prev, fd) : await createUser(prev, fd);
    if (r.ok && user) onDone();
    return r;
  }, initialFormState as UserFormState);
  const err = state.fieldErrors ?? {};

  if (state.ok && state.tempPassword) {
    return <TempPassword email={state.email ?? ""} password={state.tempPassword} onDone={onDone} />;
  }

  return (
    <form action={action} className="grid gap-4">
      {user ? <input type="hidden" name="id" value={user.id} /> : null}
      <Field label="Nickname" htmlFor="name" error={err.name} hint="What the team calls them. It's shown on their tickets and replies." required>
        <Input id="name" name="name" defaultValue={user?.name} required minLength={2} maxLength={NICKNAME_MAX} placeholder="e.g. Kevin" aria-invalid={!!err.name} />
      </Field>
      <Field label="Email" htmlFor="email" error={err.email} hint="Used to sign in." required>
        <Input id="email" name="email" type="email" defaultValue={user?.email} required maxLength={200} aria-invalid={!!err.email} />
      </Field>
      <Field label="Role" htmlFor="role" error={err.role} required>
        <SelectField id="role" name="role" defaultValue={user?.role ?? "DEV"} options={ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))} />
      </Field>
      <label className="flex items-start gap-2.5 text-sm">
        <input type="checkbox" name="designer" defaultChecked={user?.designer} className="mt-0.5 size-4 accent-acc" />
        <span>
          Designer
          <span className="block text-[12.5px] text-muted-foreground">Can send UI/UX designs for approval in Design reviews, on top of the role.</span>
        </span>
      </label>
      <label className="flex items-start gap-2.5 text-sm">
        <input type="checkbox" name="teamLead" defaultChecked={user?.teamLead} className="mt-0.5 size-4 accent-acc" />
        <span>
          Team Lead
          <span className="block text-[12.5px] text-muted-foreground">
            Can manage Team &amp; modules: add, edit, hide and delete modules and sub-modules, and set who works on each. Users stays admin-only.
          </span>
        </span>
      </label>
      {user ? (
        <label className="flex items-center gap-2.5 text-sm">
          <input type="checkbox" name="active" defaultChecked={user.active} disabled={isSelf} />
          Account is active
          {isSelf ? <input type="hidden" name="active" value="on" /> : null}
        </label>
      ) : null}
      <FormMessage state={state} />
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : user ? "Save" : "Create user"}</Button>
      </div>
    </form>
  );
}
