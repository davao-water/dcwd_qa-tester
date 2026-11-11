"use client";

import { useState } from "react";
import { EyeIcon, EyeOffIcon, type LucideIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** A password field with a show/hide button (DCWD Careers style). Use it for every password input in the app. */
export function PasswordInput({ className, icon, ...props }: Omit<React.ComponentProps<"input">, "type"> & { icon?: LucideIcon }) {
  const [visible, setVisible] = useState(false);
  const Eye = visible ? EyeOffIcon : EyeIcon;

  return (
    <IconField icon={icon}>
      {/* Edge adds its own eye to password fields; hide it so only this one shows. */}
      <Input
        {...props}
        type={visible ? "text" : "password"}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        className={cn("pr-12 [&::-ms-clear]:hidden [&::-ms-reveal]:hidden", icon && "pl-[2.625rem]", className)}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        aria-controls={props.id}
        title={visible ? "Hide password" : "Show password"}
        className="absolute inset-y-0 right-2 my-auto flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-surface3 hover:text-foreground focus-visible:ring-3 focus-visible:ring-acc/30 focus-visible:outline-none"
      >
        <Eye className="size-4" aria-hidden />
      </button>
    </IconField>
  );
}

/** Wraps an input and draws a muted leading icon inside it; give the input `pl-[2.625rem]`. */
export function IconField({ icon: Icon, children }: { icon?: LucideIcon; children: React.ReactNode }) {
  return (
    <div className="relative">
      {Icon ? <Icon className="pointer-events-none absolute inset-y-0 left-3.5 my-auto size-4 text-muted-foreground" aria-hidden /> : null}
      {children}
    </div>
  );
}
