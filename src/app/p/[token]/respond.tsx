"use client";

import { useActionState, useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { Button, Field, Input, Textarea } from "@/components/ui";
import { FormMessage, SubmitButton } from "@/components/crm/form-bits";
import { acceptProposalAction, declineProposalAction, type RespondState } from "./actions";

export function RespondPanel({ token, clientName, amount }: { token: string; clientName: string; amount: string }) {
  const [mode, setMode] = useState<"choose" | "accept" | "decline">("choose");
  const [acceptState, accept] = useActionState<RespondState, FormData>(acceptProposalAction.bind(null, token), null);
  const [declineState, decline] = useActionState<RespondState, FormData>(declineProposalAction.bind(null, token), null);
  const done = acceptState?.done ?? declineState?.done;

  if (done) {
    return done === "accepted" ? (
      <div className="flex items-start gap-3" role="status">
        <CheckCircle2 className="h-6 w-6 shrink-0 text-green-600" />
        <div>
          <p className="font-semibold">Proposal accepted — thank you!</p>
          <p className="text-sm text-muted">We’ve been notified and will be in touch shortly with next steps.</p>
        </div>
      </div>
    ) : (
      <div className="flex items-start gap-3" role="status">
        <XCircle className="h-6 w-6 shrink-0 text-muted" />
        <div>
          <p className="font-semibold">Thanks for letting us know</p>
          <p className="text-sm text-muted">We’ve passed your response along.</p>
        </div>
      </div>
    );
  }

  if (mode === "accept") {
    return (
      <form action={accept} className="space-y-4">
        <p className="font-semibold">Accept this proposal ({amount})</p>
        <Field label="Type your full name to sign">
          <Input name="signer" required autoFocus defaultValue={clientName} autoComplete="name" />
        </Field>
        <Field label="Anything you'd like us to know? (optional)">
          <Textarea name="note" rows={3} />
        </Field>
        <FormMessage state={acceptState} />
        <div className="flex flex-wrap gap-2">
          <SubmitButton size="lg" pendingText="Accepting…">
            <CheckCircle2 className="h-4 w-4" /> Accept proposal
          </SubmitButton>
          <Button type="button" variant="ghost" size="lg" onClick={() => setMode("choose")}>
            Back
          </Button>
        </div>
        <p className="text-xs text-muted">By accepting, you agree to the scope and pricing described above.</p>
      </form>
    );
  }

  if (mode === "decline") {
    return (
      <form action={decline} className="space-y-4">
        <p className="font-semibold">Decline this proposal</p>
        <Field label="Mind sharing why? (optional — it really helps)">
          <Textarea name="note" rows={3} autoFocus placeholder="Budget, timing, went another direction…" />
        </Field>
        <FormMessage state={declineState} />
        <div className="flex flex-wrap gap-2">
          <SubmitButton variant="outline" size="lg" pendingText="Sending…">
            Decline proposal
          </SubmitButton>
          <Button type="button" variant="ghost" size="lg" onClick={() => setMode("choose")}>
            Back
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-semibold">Ready to move forward?</p>
        <p className="text-sm text-muted">Accept online in seconds, or let us know it’s not the right fit.</p>
      </div>
      <div className="flex w-full gap-2 sm:w-auto">
        <Button variant="outline" size="lg" className="flex-1 justify-center sm:flex-none" onClick={() => setMode("decline")}>
          Decline
        </Button>
        <Button size="lg" className="flex-1 justify-center sm:flex-none" onClick={() => setMode("accept")}>
          <CheckCircle2 className="h-4 w-4" /> Accept
        </Button>
      </div>
    </div>
  );
}
