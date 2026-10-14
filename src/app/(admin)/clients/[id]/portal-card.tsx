"use client";

import { useState, useTransition } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import { CheckCircle2, KeyRound, Loader2, Send } from "lucide-react";
import { Button, Card, CardHeader } from "@/components/ui";
import { FormMessage } from "@/components/crm/form-bits";
import { inviteToPortalAction, type ActionState } from "../actions";

export function PortalCard({
  clientId,
  email,
  linked,
  lastLogin,
}: {
  clientId: string;
  email: string;
  linked: boolean;
  lastLogin: string | null;
}) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<ActionState>(null);

  return (
    <Card>
      <CardHeader title="Client portal" icon={<KeyRound className="h-5 w-5" />} />
      <div className="space-y-4 p-5">
        {linked ? (
          <div className="flex items-start gap-2 rounded-lg bg-green-50 p-3 text-sm text-green-800">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">Portal account active</p>
              {lastLogin && <p className="text-xs text-green-700">Last signed in {formatDistanceToNowStrict(new Date(lastLogin), { addSuffix: true })}</p>}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted">
            Not signed in yet. Send an invite and they’ll get a one-click sign-in link at <span className="font-medium text-foreground">{email}</span>.
          </p>
        )}
        <FormMessage state={state} />
        <Button
          variant={linked ? "outline" : "primary"}
          className="w-full justify-center"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setState(await inviteToPortalAction(clientId));
            })
          }
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {linked ? "Send sign-in link" : "Invite to portal"}
        </Button>
        <p className="text-xs text-muted">Links expire shortly after sending; they can always request a new one from the sign-in page.</p>
      </div>
    </Card>
  );
}
