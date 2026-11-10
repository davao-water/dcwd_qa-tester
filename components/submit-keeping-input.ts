import { startTransition } from "react";

/**
 * `<form action>` resets every field once the action finishes, even when it failed validation, which would lose a long
 * description and the uploaded files' ids. Submitting this way keeps what the user typed.
 */
export function submitKeepingInput(action: (fd: FormData) => void) {
  return (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => action(fd));
  };
}
