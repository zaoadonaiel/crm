"use client";

import { useActionState, useState, useTransition } from "react";
import { Package, Pencil, Plus, Trash2, Users } from "lucide-react";
import { Badge, Button, Card, EmptyState, Field, Input, Select, Textarea } from "@/components/ui";
import { Modal } from "@/components/crm/modal";
import { FormMessage, SubmitButton } from "@/components/crm/form-bits";
import { money } from "@/lib/utils";
import { centsToInput, intervalLabel, type Interval } from "@/lib/billing/format";
import { deleteServiceAction, saveServiceAction, toggleServiceActiveAction, type ServiceActionState } from "./actions";

export type ServiceRow = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  interval: Interval;
  active: boolean;
  clients: number;
};

export function ServicesManager({ rows }: { rows: ServiceRow[] }) {
  const [editing, setEditing] = useState<ServiceRow | "new" | null>(null);
  const [pending, start] = useTransition();
  const active = rows.filter((r) => r.active);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {active.length} active · {rows.length - active.length} archived
        </p>
        <Button onClick={() => setEditing("new")}>
          <Plus className="h-4 w-4" /> New service
        </Button>
      </div>

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Package className="h-5 w-5" />}
            title="No services yet"
            description="Add the things you sell — hosting, maintenance plans, SEO retainers — and assign them to clients."
            action={
              <Button onClick={() => setEditing("new")}>
                <Plus className="h-4 w-4" /> Add your first service
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((s) => (
            <Card key={s.id} className={`flex flex-col p-5 ${s.active ? "" : "opacity-70"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-lg bg-brand-50 text-brand">
                  <Package className="h-5 w-5" />
                </div>
                {!s.active && <Badge>Archived</Badge>}
              </div>
              <h3 className="mt-3 font-semibold">{s.name}</h3>
              {s.description && <p className="mt-1 line-clamp-2 text-sm text-muted">{s.description}</p>}
              <p className="mt-3 text-2xl font-bold tracking-tight">
                {money(s.price, s.currency)}
                <span className="text-sm font-normal text-muted">{intervalLabel(s.interval, true) || " one-time"}</span>
              </p>
              <div className="mt-auto flex items-center justify-between gap-2 pt-4">
                <span className="inline-flex items-center gap-1.5 text-xs text-muted">
                  <Users className="h-3.5 w-3.5" /> {s.clients} client{s.clients === 1 ? "" : "s"}
                </span>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => start(() => toggleServiceActiveAction(s.id, !s.active))}
                  >
                    {s.active ? "Archive" : "Restore"}
                  </Button>
                  <Button size="icon" variant="ghost" aria-label={`Edit ${s.name}`} onClick={() => setEditing(s)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Delete ${s.name}`}
                    disabled={pending}
                    onClick={() => {
                      const msg = s.clients
                        ? `Delete “${s.name}”? ${s.clients} client${s.clients === 1 ? " keeps" : "s keep"} their copy of this service.`
                        : `Delete “${s.name}”?`;
                      if (confirm(msg)) start(() => deleteServiceAction(s.id));
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "New service" : "Edit service"}>
        {editing !== null && (
          <ServiceForm key={editing === "new" ? "new" : editing.id} item={editing === "new" ? null : editing} onDone={() => setEditing(null)} />
        )}
      </Modal>
    </>
  );
}

function ServiceForm({ item, onDone }: { item: ServiceRow | null; onDone: () => void }) {
  const [state, action] = useActionState<ServiceActionState, FormData>(saveServiceAction.bind(null, item?.id ?? null), null);
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state?.message) onDone();
  }
  return (
    <form action={action} className="space-y-4">
      <Field label="Name">
        <Input name="name" required autoFocus defaultValue={item?.name} placeholder="Managed WordPress hosting" />
      </Field>
      <Field label="Description" hint="Shown to clients in their portal">
        <Textarea name="description" rows={3} defaultValue={item?.description ?? ""} />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Price (USD)">
          <Input name="price" inputMode="decimal" required defaultValue={item ? centsToInput(item.price) : ""} placeholder="49.00" />
        </Field>
        <Field label="Billing interval">
          <Select name="interval" defaultValue={item?.interval ?? "month"}>
            <option value="month">Monthly</option>
            <option value="year">Yearly</option>
            <option value="one_time">One-time</option>
          </Select>
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" defaultChecked={item?.active ?? true} className="h-4 w-4 accent-[var(--brand)]" />
        Active (available to assign)
      </label>
      <FormMessage state={state?.error ? state : null} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <SubmitButton pendingText="Saving…">{item ? "Save" : "Create service"}</SubmitButton>
      </div>
    </form>
  );
}
