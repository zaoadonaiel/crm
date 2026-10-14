"use client";

import * as React from "react";
import { useFormStatus } from "react-dom";
import { Loader2, Play, Plus } from "lucide-react";
import { Button, Field, Input } from "@/components/ui";
import { createSequence, runDueNow, setSequenceActive } from "@/app/(admin)/automations/actions";
import { Dialog } from "@/components/inbox/overlay";
import { cn } from "@/lib/utils";
import { TRIGGERS, type SequenceTrigger } from "./constants";

export function Switch({
  checked,
  onChange,
  label,
  disabled,
  showLabel = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
  showLabel?: boolean;
}) {
  return (
    <label className={cn("inline-flex cursor-pointer items-center gap-2 text-[13px]", disabled && "cursor-not-allowed opacity-60")}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={showLabel ? undefined : label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-5 w-9 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/30",
          checked ? "bg-brand" : "bg-black/15",
        )}
      >
        <span
          className={cn(
            "absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform",
            checked && "translate-x-4",
          )}
        />
      </button>
      {showLabel && <span>{label}</span>}
    </label>
  );
}

export function ActiveToggle({ id, active, name }: { id: string; active: boolean; name: string }) {
  const [optimistic, setOptimistic] = React.useOptimistic(active);
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  return (
    <div className="flex items-center gap-2">
      <Switch
        checked={optimistic}
        disabled={pending}
        label={`${optimistic ? "Pause" : "Activate"} ${name}`}
        onChange={(v) =>
          start(async () => {
            setError(null);
            setOptimistic(v);
            const res = await setSequenceActive(id, v);
            if (!res.ok) setError(res.error);
          })
        }
      />
      <span className={cn("text-[13px] font-medium", optimistic ? "text-foreground" : "text-muted")}>{optimistic ? "Active" : "Paused"}</span>
      {error && (
        <span role="alert" className="text-xs text-danger">
          {error}
        </span>
      )}
    </div>
  );
}

function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </Button>
  );
}

export function NewSequenceButton() {
  const [open, setOpen] = React.useState(false);
  const [trigger, setTrigger] = React.useState<SequenceTrigger>("manual");
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> New sequence
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="New sequence" description="You can add steps and activate it on the next screen.">
        <form action={createSequence} className="space-y-4">
          <Field label="Name">
            <Input name="name" required maxLength={120} placeholder="e.g. Cold lead nurture" autoFocus />
          </Field>
          <fieldset>
            <legend className="mb-1.5 text-[13px] font-medium">Trigger</legend>
            <div className="grid gap-2">
              {TRIGGERS.map((t) => (
                <label
                  key={t.value}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors",
                    trigger === t.value ? "border-brand bg-brand-50/60" : "border-border hover:bg-surface-2",
                  )}
                >
                  <input
                    type="radio"
                    name="trigger"
                    value={t.value}
                    checked={trigger === t.value}
                    onChange={() => setTrigger(t.value)}
                    className="mt-1 accent-[var(--brand)]"
                  />
                  <span>
                    <span className="block text-sm font-medium">{t.label}</span>
                    <span className="block text-xs text-muted">{t.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton>Create sequence</SubmitButton>
          </div>
        </form>
      </Dialog>
    </>
  );
}

export function RunNowButton() {
  const [pending, start] = React.useTransition();
  const [msg, setMsg] = React.useState<string | null>(null);
  return (
    <div className="flex items-center gap-2">
      {msg && (
        <span role="status" className="hidden text-xs text-muted sm:inline">
          {msg}
        </span>
      )}
      <Button
        variant="outline"
        title="Process any follow-ups that are due right now (normally runs automatically every few minutes)"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setMsg(null);
            const res = await runDueNow();
            if (!res.ok) setMsg(res.error);
            else {
              const d = res.data;
              setMsg(
                d.processed === 0
                  ? "Nothing due right now"
                  : `Sent ${d.sent} · stopped ${d.stopped} · completed ${d.completed}${d.failed ? ` · ${d.failed} failed` : ""}`,
              );
            }
          })
        }
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
        <span className="hidden sm:inline">Run due now</span>
      </Button>
    </div>
  );
}
