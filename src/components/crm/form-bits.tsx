"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui";

/** Submit button that shows a spinner while its parent <form> action is pending. */
export function SubmitButton({ children, pendingText, disabled, ...props }: ButtonProps & { pendingText?: string }) {
  const status = useFormStatus();
  // With several submit buttons (name/value), only the one that was clicked shows the spinner.
  const mine =
    props.name && props.value !== undefined && status.data ? status.data.get(props.name) === String(props.value) : true;
  const pending = status.pending && mine;
  return (
    <Button type="submit" disabled={status.pending || disabled} aria-busy={pending} {...props}>
      {pending && <Loader2 className="h-4 w-4 animate-spin" />}
      {pending && pendingText ? pendingText : children}
    </Button>
  );
}

export function FormMessage({ state }: { state?: { error?: string; message?: string } | null }) {
  if (!state) return null;
  if (state.error)
    return (
      <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-danger">
        {state.error}
      </p>
    );
  if (state.message)
    return (
      <p role="status" className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
        {state.message}
      </p>
    );
  return null;
}
