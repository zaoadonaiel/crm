"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import { Button, Field, Input, Select } from "@/components/ui";
import { Modal } from "@/components/crm/modal";
import { FormMessage, SubmitButton } from "@/components/crm/form-bits";
import { createProposalAction, type ProposalActionState } from "./actions";

export function NewProposalButton({ clients }: { clients: { id: string; name: string; company: string | null }[] }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<ProposalActionState, FormData>(createProposalAction, null);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> New proposal
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="New proposal" description="You'll write the details on the next screen.">
        {clients.length === 0 ? (
          <p className="text-sm text-muted">Add a client first — proposals are always sent to a client.</p>
        ) : (
          <form action={action} className="space-y-4">
            <Field label="Client">
              <Select name="clientId" required defaultValue="">
                <option value="" disabled>
                  Choose a client…
                </option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.company ? ` — ${c.company}` : ""}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Title" hint="Leave blank to use “Proposal for <company>”">
              <Input name="title" placeholder="Website redesign & hosting" />
            </Field>
            <FormMessage state={state} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <SubmitButton pendingText="Creating…">Create draft</SubmitButton>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
