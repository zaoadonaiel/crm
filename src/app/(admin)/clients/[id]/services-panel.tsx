"use client";

import { useActionState, useState, useTransition } from "react";
import { CalendarClock, Package, Pencil, Plus, Trash2, X } from "lucide-react";
import { Badge, Button, Card, CardHeader, Field, Input, Select, Textarea } from "@/components/ui";
import { Modal } from "@/components/crm/modal";
import { FormMessage, SubmitButton } from "@/components/crm/form-bits";
import { statusTone } from "@/lib/status";
import { money } from "@/lib/utils";
import { centsToInput, fmtDate, intervalLabel, type Interval } from "@/lib/billing/format";
import { addClientServiceAction, deleteClientServiceAction, updateClientServiceAction, type ActionState } from "../actions";

type ServiceStatus = "active" | "pending" | "paused" | "cancelled";

export type ClientServiceItem = {
  id: string;
  name: string;
  description: string | null;
  status: ServiceStatus;
  price: number;
  currency: string;
  interval: Interval;
  startDate: string | null;
  renewalDate: string | null;
  details: Record<string, string>;
};

export type CatalogItem = { id: string; name: string; description: string | null; price: number; interval: Interval };

export function ServicesPanel({ clientId, items, catalog }: { clientId: string; items: ClientServiceItem[]; catalog: CatalogItem[] }) {
  const [editing, setEditing] = useState<ClientServiceItem | "new" | null>(null);
  const [pending, start] = useTransition();

  return (
    <Card>
      <CardHeader
        title="Services"
        description="What this client has with you — they see this in their portal"
        icon={<Package className="h-5 w-5" />}
        action={
          <Button size="sm" variant="secondary" onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" /> Assign service
          </Button>
        }
      />
      {items.length ? (
        <ul className="divide-y divide-border">
          {items.map((s) => (
            <li key={s.id} className="flex flex-wrap items-start gap-4 px-5 py-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{s.name}</p>
                  <Badge tone={statusTone(s.status)}>{s.status}</Badge>
                </div>
                {s.description && <p className="mt-0.5 text-sm text-muted">{s.description}</p>}
                {Object.keys(s.details).length > 0 && (
                  <dl className="mt-2 flex flex-wrap gap-1.5">
                    {Object.entries(s.details).map(([k, v]) => (
                      <div key={k} className="flex items-center gap-1 rounded-md border border-border bg-surface-2 px-2 py-0.5 text-xs">
                        <dt className="text-muted">{k}:</dt>
                        <dd className="font-medium">{v}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {s.renewalDate && (
                  <p className="mt-2 inline-flex items-center gap-1 text-xs text-muted">
                    <CalendarClock className="h-3.5 w-3.5" /> {s.interval === "one_time" ? "Due" : "Renews"} {fmtDate(s.renewalDate)}
                  </p>
                )}
              </div>
              <div className="text-right">
                <p className="font-semibold tabular-nums">
                  {money(s.price, s.currency)}
                  <span className="text-xs font-normal text-muted">{intervalLabel(s.interval, true)}</span>
                </p>
                <div className="mt-1 flex justify-end gap-1">
                  <Button size="icon" variant="ghost" aria-label={`Edit ${s.name}`} onClick={() => setEditing(s)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Remove ${s.name}`}
                    disabled={pending}
                    onClick={() => {
                      if (confirm(`Remove “${s.name}” from this client?`)) start(() => deleteClientServiceAction(s.id));
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-5 py-6 text-sm text-muted">No services yet. Assign one from your catalog or add a custom service.</p>
      )}

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "Assign a service" : "Edit service"}
        description="Details (like Domain or Plan) are shown to the client in their portal."
        className="max-w-2xl"
      >
        {editing !== null && (
          <ServiceForm
            key={editing === "new" ? "new" : editing.id}
            clientId={clientId}
            item={editing === "new" ? null : editing}
            catalog={catalog}
            onDone={() => setEditing(null)}
          />
        )}
      </Modal>
    </Card>
  );
}

function toDateInput(iso: string | null) {
  return iso ? iso.slice(0, 10) : "";
}

function ServiceForm({
  clientId,
  item,
  catalog,
  onDone,
}: {
  clientId: string;
  item: ClientServiceItem | null;
  catalog: CatalogItem[];
  onDone: () => void;
}) {
  const bound = item ? updateClientServiceAction.bind(null, item.id) : addClientServiceAction.bind(null, clientId);
  const [state, action] = useActionState<ActionState, FormData>(bound, null);
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state?.message) onDone();
  }

  const [serviceId, setServiceId] = useState("");
  const [name, setName] = useState(item?.name ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [price, setPrice] = useState(item ? centsToInput(item.price) : "");
  const [interval, setBillingInterval] = useState<Interval>(item?.interval ?? "month");
  const [details, setDetails] = useState<[string, string][]>(item ? Object.entries(item.details) : []);

  const pick = (id: string) => {
    setServiceId(id);
    const s = catalog.find((c) => c.id === id);
    if (!s) return;
    setName(s.name);
    setDescription(s.description ?? "");
    setPrice(centsToInput(s.price));
    setBillingInterval(s.interval);
  };

  return (
    <form action={action} className="space-y-4">
      {!item && catalog.length > 0 && (
        <Field label="From catalog" hint="Pre-fills the fields below — you can still customise them">
          <Select value={serviceId} onChange={(e) => pick(e.target.value)}>
            <option value="">Custom service</option>
            {catalog.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} — {money(c.price)}
                {intervalLabel(c.interval, true)}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <input type="hidden" name="serviceId" value={serviceId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" className="sm:col-span-2">
          <Input name="name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Managed WordPress hosting" />
        </Field>
        <Field label="Description" className="sm:col-span-2">
          <Textarea name="description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-16" />
        </Field>
        <Field label="Price (USD)">
          <Input name="price" inputMode="decimal" required value={price} onChange={(e) => setPrice(e.target.value)} placeholder="49.00" />
        </Field>
        <Field label="Billing interval">
          <Select name="interval" value={interval} onChange={(e) => setBillingInterval(e.target.value as Interval)}>
            <option value="month">Monthly</option>
            <option value="year">Yearly</option>
            <option value="one_time">One-time</option>
          </Select>
        </Field>
        <Field label="Status">
          <Select name="status" defaultValue={item?.status ?? "active"}>
            <option value="active">Active</option>
            <option value="pending">Pending</option>
            <option value="paused">Paused</option>
            <option value="cancelled">Cancelled</option>
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start date">
            <Input name="startDate" type="date" defaultValue={toDateInput(item?.startDate ?? new Date().toISOString())} />
          </Field>
          <Field label="Renewal date">
            <Input name="renewalDate" type="date" defaultValue={toDateInput(item?.renewalDate ?? null)} />
          </Field>
        </div>
      </div>

      <fieldset>
        <legend className="mb-1.5 text-[13px] font-medium">Details shown to the client</legend>
        <div className="space-y-2">
          {details.map(([k, v], i) => (
            <div key={i} className="flex gap-2">
              <Input
                aria-label="Detail label"
                placeholder="Domain"
                value={k}
                className="w-40"
                onChange={(e) => setDetails(details.map((d, j) => (j === i ? [e.target.value, d[1]] : d)))}
              />
              <Input
                aria-label="Detail value"
                placeholder="acme.com"
                value={v}
                onChange={(e) => setDetails(details.map((d, j) => (j === i ? [d[0], e.target.value] : d)))}
              />
              <Button type="button" size="icon" variant="ghost" aria-label="Remove detail" onClick={() => setDetails(details.filter((_, j) => j !== i))}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <div className="flex flex-wrap gap-1.5">
            <Button type="button" size="sm" variant="outline" onClick={() => setDetails([...details, ["", ""]])}>
              <Plus className="h-3.5 w-3.5" /> Add detail
            </Button>
            {["Domain", "Plan", "Server", "Login URL"]
              .filter((k) => !details.some(([dk]) => dk === k))
              .map((k) => (
                <button
                  type="button"
                  key={k}
                  className="rounded-full border border-dashed border-border px-2.5 text-xs text-muted hover:border-brand hover:text-brand"
                  onClick={() => setDetails([...details, [k, ""]])}
                >
                  + {k}
                </button>
              ))}
          </div>
        </div>
        <input type="hidden" name="details" value={JSON.stringify(details.filter(([k]) => k.trim()))} />
      </fieldset>

      <FormMessage state={state?.error ? state : null} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <SubmitButton pendingText="Saving…">{item ? "Save service" : "Assign service"}</SubmitButton>
      </div>
    </form>
  );
}
