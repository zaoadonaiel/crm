"use client";

import { useActionState, useState } from "react";
import { Plus, Send, Trash2 } from "lucide-react";
import { Button, Card, Field, Input, Select, Textarea } from "@/components/ui";
import { FormMessage, SubmitButton } from "@/components/crm/form-bits";
import { money } from "@/lib/utils";
import { intervalLabel, parseMoneyToCents, type Interval } from "@/lib/billing/format";
import { createInvoiceAction, type InvoiceActionState } from "../actions";

export type DraftItem = { description: string; amount: string; quantity: string };

const DUE_OPTIONS = [0, 7, 14, 15, 30, 45, 60];

export function InvoiceForm({
  clients,
  catalog,
  initialClientId,
  initialItems,
}: {
  clients: { id: string; name: string; company: string | null; email: string }[];
  catalog: { id: string; name: string; price: number; interval: Interval }[];
  initialClientId: string;
  initialItems: DraftItem[];
}) {
  const [state, action] = useActionState<InvoiceActionState, FormData>(createInvoiceAction, null);
  const [clientId, setClientId] = useState(initialClientId);
  const [items, setItems] = useState<DraftItem[]>(initialItems.length ? initialItems : [{ description: "", amount: "", quantity: "1" }]);
  const [send, setSend] = useState(true);

  const parsed = items.map((i) => ({
    description: i.description.trim(),
    amountCents: parseMoneyToCents(i.amount),
    quantity: Math.max(0, Math.round(Number(i.quantity) || 0)),
  }));
  const total = parsed.reduce((a, i) => a + (Number.isNaN(i.amountCents) ? 0 : i.amountCents * i.quantity), 0);
  const client = clients.find((c) => c.id === clientId);
  const update = (idx: number, patch: Partial<DraftItem>) => setItems(items.map((it, j) => (j === idx ? { ...it, ...patch } : it)));

  return (
    <form action={action} className="space-y-6">
      <Card className="grid gap-4 p-5 sm:grid-cols-2">
        <Field label="Client">
          <Select name="clientId" required value={clientId} onChange={(e) => setClientId(e.target.value)}>
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
          {client && <p className="mt-1 text-xs text-muted">Invoice will be sent to {client.email}</p>}
        </Field>
        <Field label="Payment due">
          <Select name="daysUntilDue" defaultValue="14">
            {DUE_OPTIONS.map((d) => (
              <option key={d} value={d}>
                {d === 0 ? "Due on receipt" : `In ${d} days`}
              </option>
            ))}
          </Select>
        </Field>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
          <h2 className="font-semibold">Line items</h2>
          {catalog.length > 0 && (
            <Select
              aria-label="Add from catalog"
              className="h-8 w-56 text-[13px]"
              value=""
              onChange={(e) => {
                const s = catalog.find((c) => c.id === e.target.value);
                if (!s) return;
                const row = {
                  description: s.interval === "one_time" ? s.name : `${s.name} (${intervalLabel(s.interval).toLowerCase()})`,
                  amount: (s.price / 100).toFixed(2),
                  quantity: "1",
                };
                const blankIdx = items.findIndex((i) => !i.description && !i.amount);
                setItems(blankIdx >= 0 ? items.map((it, j) => (j === blankIdx ? row : it)) : [...items, row]);
              }}
            >
              <option value="">+ Add from catalog…</option>
              {catalog.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — {money(c.price)}
                </option>
              ))}
            </Select>
          )}
        </div>
        <div className="divide-y divide-border">
          <div className="hidden grid-cols-[1fr_130px_80px_110px_40px] gap-3 bg-surface-2 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-muted sm:grid">
            <span>Description</span>
            <span>Unit price</span>
            <span>Qty</span>
            <span className="text-right">Amount</span>
            <span />
          </div>
          {items.map((it, idx) => {
            const p = parsed[idx]!;
            return (
              <div key={idx} className="grid grid-cols-[1fr_1fr_70px_40px] items-center gap-3 px-5 py-3 sm:grid-cols-[1fr_130px_80px_110px_40px]">
                <Input
                  aria-label={`Line ${idx + 1} description`}
                  placeholder="Website maintenance — October"
                  value={it.description}
                  onChange={(e) => update(idx, { description: e.target.value })}
                  className="col-span-4 sm:col-span-1"
                />
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">$</span>
                  <Input
                    aria-label={`Line ${idx + 1} unit price`}
                    inputMode="decimal"
                    placeholder="0.00"
                    value={it.amount}
                    onChange={(e) => update(idx, { amount: e.target.value })}
                    className="pl-7"
                    aria-invalid={Number.isNaN(p.amountCents)}
                  />
                </div>
                <Input
                  aria-label={`Line ${idx + 1} quantity`}
                  type="number"
                  min={1}
                  step={1}
                  value={it.quantity}
                  onChange={(e) => update(idx, { quantity: e.target.value })}
                />
                <span className="hidden text-right font-medium tabular-nums sm:block">
                  {Number.isNaN(p.amountCents) ? "—" : money(p.amountCents * p.quantity)}
                </span>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={`Remove line ${idx + 1}`}
                  disabled={items.length === 1}
                  onClick={() => setItems(items.filter((_, j) => j !== idx))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-between border-t border-border px-5 py-3">
          <Button type="button" size="sm" variant="outline" onClick={() => setItems([...items, { description: "", amount: "", quantity: "1" }])}>
            <Plus className="h-4 w-4" /> Add line
          </Button>
          <div className="text-right">
            <p className="text-xs text-muted">Total</p>
            <p className="text-xl font-bold tabular-nums">{money(total)}</p>
          </div>
        </div>
      </Card>

      <input
        type="hidden"
        name="items"
        value={JSON.stringify(parsed.filter((i) => i.description || i.amountCents).map((i) => ({ ...i, amountCents: Number.isNaN(i.amountCents) ? 0 : i.amountCents })))}
      />

      <Card className="space-y-4 p-5">
        <Field label="Memo (optional)" hint="Shown on the invoice and payment page">
          <Textarea name="memo" rows={2} maxLength={500} placeholder="Thanks for your business!" className="min-h-16" />
        </Field>
        <label className="flex items-start gap-2.5 text-sm">
          <input type="checkbox" name="send" checked={send} onChange={(e) => setSend(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--brand)]" />
          <span>
            <span className="font-medium">Email it to the client now</span>
            <span className="block text-xs text-muted">Sends your branded invoice email with a secure Stripe payment link, and starts any “invoice sent” follow-ups.</span>
          </span>
        </label>
      </Card>

      <FormMessage state={state} />
      <div className="flex justify-end gap-2">
        <SubmitButton size="lg" pendingText={send ? "Creating & sending…" : "Creating…"} disabled={!clientId || total <= 0}>
          <Send className="h-4 w-4" /> {send ? `Create & send ${money(total)}` : "Create invoice"}
        </SubmitButton>
      </div>
    </form>
  );
}
