"use client";

import { useActionState, useState, useTransition } from "react";
import { Building2, Globe, Mail, Pencil, Phone, StickyNote, Trash2 } from "lucide-react";
import type { ClientStatus } from "@/db/schema";
import { Avatar, Badge, Button, Card, Field, Input, Select, Textarea } from "@/components/ui";
import { FormMessage, SubmitButton } from "@/components/crm/form-bits";
import { statusTone } from "@/lib/status";
import { fmtDate } from "@/lib/billing/format";
import { deleteClientAction, updateClientAction, type ActionState } from "../actions";

const STATUSES: ClientStatus[] = ["lead", "prospect", "active", "past"];

type Client = {
  id: string;
  name: string;
  email: string;
  company: string | null;
  phone: string | null;
  website: string | null;
  status: ClientStatus;
  tags: string[];
  notes: string | null;
  createdAt: string;
};

export function ProfileCard({ client }: { client: Client }) {
  const [editing, setEditing] = useState(false);
  const [state, action] = useActionState<ActionState, FormData>(updateClientAction.bind(null, client.id), null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, startDelete] = useTransition();

  // Close the editor once a save succeeds (adjust state during render, no effect needed).
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state?.message) setEditing(false);
  }

  if (!editing) {
    return (
      <Card>
        <div className="flex flex-wrap items-start gap-4 p-5">
          <Avatar name={client.name} size={56} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight">{client.name}</h1>
              <Badge tone={statusTone(client.status)}>{client.status}</Badge>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
              <a href={`mailto:${client.email}`} className="inline-flex items-center gap-1.5 hover:text-foreground">
                <Mail className="h-3.5 w-3.5" /> {client.email}
              </a>
              {client.company && (
                <span className="inline-flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5" /> {client.company}
                </span>
              )}
              {client.phone && (
                <a href={`tel:${client.phone}`} className="inline-flex items-center gap-1.5 hover:text-foreground">
                  <Phone className="h-3.5 w-3.5" /> {client.phone}
                </a>
              )}
              {client.website && (
                <a href={client.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 hover:text-foreground">
                  <Globe className="h-3.5 w-3.5" /> {client.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                </a>
              )}
            </div>
            {client.tags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {client.tags.map((t) => (
                  <span key={t} className="rounded-md border border-border bg-surface-2 px-2 py-0.5 text-xs">
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden text-xs text-muted sm:inline">Added {fmtDate(client.createdAt)}</span>
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil className="h-3.5 w-3.5" /> Edit
            </Button>
          </div>
        </div>
        {client.notes && (
          <div className="border-t border-border px-5 py-4">
            <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
              <StickyNote className="h-3.5 w-3.5" /> Notes
            </p>
            <p className="whitespace-pre-wrap text-sm text-foreground/90">{client.notes}</p>
          </div>
        )}
      </Card>
    );
  }

  return (
    <Card>
      <form action={action} className="space-y-4 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name">
            <Input name="name" required defaultValue={client.name} autoFocus />
          </Field>
          <Field label="Email">
            <Input name="email" type="email" required defaultValue={client.email} />
          </Field>
          <Field label="Company">
            <Input name="company" defaultValue={client.company ?? ""} />
          </Field>
          <Field label="Phone">
            <Input name="phone" type="tel" defaultValue={client.phone ?? ""} />
          </Field>
          <Field label="Website">
            <Input name="website" defaultValue={client.website ?? ""} placeholder="acme.com" />
          </Field>
          <Field label="Status">
            <Select name="status" defaultValue={client.status}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s[0]!.toUpperCase() + s.slice(1)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Tags" hint="Comma-separated" className="sm:col-span-2">
            <Input name="tags" defaultValue={client.tags.join(", ")} />
          </Field>
          <Field label="Internal notes" hint="Only visible to your team" className="sm:col-span-2">
            <Textarea name="notes" rows={4} defaultValue={client.notes ?? ""} />
          </Field>
        </div>
        <FormMessage state={state?.error ? state : null} />
        <div className="flex flex-wrap items-center justify-between gap-2">
          {confirmDelete ? (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-danger">Delete this client, their proposals, invoices and messages?</span>
              <Button
                type="button"
                variant="danger"
                size="sm"
                disabled={deleting}
                onClick={() => startDelete(() => deleteClientAction(client.id))}
              >
                Delete
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button type="button" variant="ghost" size="sm" className="text-danger" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-3.5 w-3.5" /> Delete client
            </Button>
          )}
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <SubmitButton pendingText="Saving…">Save changes</SubmitButton>
          </div>
        </div>
      </form>
    </Card>
  );
}
