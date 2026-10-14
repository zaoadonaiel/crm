"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDistanceToNowStrict } from "date-fns";
import { CheckCircle2, Plus, Search, Tag, Trash2, Upload, Users, X } from "lucide-react";
import type { ClientStatus } from "@/db/schema";
import { Avatar, Badge, Button, EmptyState, Field, Input, Select, Textarea } from "@/components/ui";
import { Modal } from "@/components/crm/modal";
import { FormMessage, SubmitButton } from "@/components/crm/form-bits";
import { statusTone } from "@/lib/status";
import { fmtDate } from "@/lib/billing/format";
import { money } from "@/lib/utils";
import {
  bulkAddTagAction,
  bulkDeleteAction,
  bulkRemoveTagAction,
  bulkSetStatusAction,
  createClientAction,
  importClientsAction,
  type ActionState,
} from "./actions";

const CLIENT_STATUSES: ClientStatus[] = ["lead", "prospect", "active", "past"];

export type ClientRow = {
  id: string;
  name: string;
  email: string;
  company: string | null;
  status: ClientStatus;
  tags: string[];
  services: number;
  balance: number;
  lastContactedAt: string | null;
  createdAt: string;
  portal: boolean;
};

/* Header actions: add + import ------------------------------------- */

export function ClientsHeaderActions() {
  const [open, setOpen] = useState<"add" | "import" | null>(null);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen("import")}>
        <Upload className="h-4 w-4" /> Import CSV
      </Button>
      <Button onClick={() => setOpen("add")}>
        <Plus className="h-4 w-4" /> Add client
      </Button>
      <Modal open={open === "add"} onClose={() => setOpen(null)} title="Add client" description="They won't be emailed until you invite them.">
        <AddClientForm onDone={() => setOpen(null)} />
      </Modal>
      <Modal
        open={open === "import"}
        onClose={() => setOpen(null)}
        title="Import clients from CSV"
        description="Columns: name, email, company, phone, tags. Existing emails are skipped."
        className="max-w-xl"
      >
        <ImportForm />
      </Modal>
    </>
  );
}

function AddClientForm({ onDone }: { onDone: () => void }) {
  // On success the action redirects to the new client's profile.
  const [state, action] = useActionState<ActionState, FormData>(createClientAction, null);
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name">
          <Input name="name" required autoFocus placeholder="Jane Cooper" />
        </Field>
        <Field label="Email">
          <Input name="email" type="email" required placeholder="jane@acme.com" />
        </Field>
        <Field label="Company">
          <Input name="company" placeholder="Acme Inc." />
        </Field>
        <Field label="Phone">
          <Input name="phone" type="tel" placeholder="+1 555 000 1234" />
        </Field>
        <Field label="Status">
          <Select name="status" defaultValue="lead">
            {CLIENT_STATUSES.map((s) => (
              <option key={s} value={s} className="capitalize">
                {s[0]!.toUpperCase() + s.slice(1)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Tags" hint="Comma-separated">
          <Input name="tags" placeholder="wordpress, referral" />
        </Field>
      </div>
      <FormMessage state={state?.error ? state : null} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <SubmitButton pendingText="Adding…">Add client</SubmitButton>
      </div>
    </form>
  );
}

function ImportForm() {
  const [state, action] = useActionState<ActionState, FormData>(importClientsAction, null);
  const [fileName, setFileName] = useState<string | null>(null);
  return (
    <form action={action} className="space-y-4">
      <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border bg-surface-2 px-4 py-6 text-center transition hover:border-brand/50 focus-within:border-brand">
        <Upload className="h-6 w-6 text-brand" aria-hidden />
        <span className="text-sm font-medium">{fileName ?? "Choose a .csv file"}</span>
        <span className="text-xs text-muted">or paste rows below</span>
        <input
          type="file"
          name="file"
          accept=".csv,text/csv,text/plain"
          className="sr-only"
          onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
        />
      </label>
      <Field label="Paste CSV" hint="A header row is optional. Tags can be separated with ; or |">
        <Textarea
          name="csv"
          rows={6}
          className="font-mono text-xs"
          placeholder={"name,email,company,phone,tags\nJane Cooper,jane@acme.com,Acme Inc.,555-0100,wordpress;seo"}
        />
      </Field>
      <FormMessage state={state} />
      <div className="flex justify-end">
        <SubmitButton pendingText="Importing…">
          <Upload className="h-4 w-4" /> Import
        </SubmitButton>
      </div>
    </form>
  );
}

/* Filters ---------------------------------------------------------- */

export function ClientFilters({ q, tag, status, tags }: { q: string; tag: string; status: string; tags: string[] }) {
  const router = useRouter();
  const [value, setValue] = useState(q);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const go = (next: { q?: string; tag?: string }) => {
    const qs = new URLSearchParams();
    const nq = next.q ?? value;
    const nt = next.tag ?? tag;
    if (nq.trim()) qs.set("q", nq.trim());
    if (nt) qs.set("tag", nt);
    if (status !== "all") qs.set("status", status);
    router.replace(`/clients${qs.size ? `?${qs}` : ""}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-border p-3">
      <form
        role="search"
        className="relative min-w-56 flex-1"
        onSubmit={(e) => {
          e.preventDefault();
          go({});
        }}
      >
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
        <Input
          aria-label="Search clients"
          placeholder="Search by name, email or company"
          value={value}
          className="pl-9"
          onChange={(e) => {
            setValue(e.target.value);
            clearTimeout(timer.current);
            const v = e.target.value;
            timer.current = setTimeout(() => go({ q: v }), 350);
          }}
        />
      </form>
      <div className="flex items-center gap-2">
        <Tag className="h-4 w-4 text-muted" aria-hidden />
        <Select aria-label="Filter by tag" value={tag} onChange={(e) => go({ tag: e.target.value })} className="w-44">
          <option value="">All tags</option>
          {tags.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}

/* Table ------------------------------------------------------------ */

export function ClientsTable({ rows, allTags, filtered }: { rows: ClientRow[]; allTags: string[]; filtered: boolean }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const [flash, setFlash] = useState<ActionState>(null);
  const [tagInput, setTagInput] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Drop selections that are no longer on the page (after filtering/paging)
  const visible = new Set(rows.map((r) => r.id));
  const sel = [...selected].filter((id) => visible.has(id));
  const allChecked = rows.length > 0 && sel.length === rows.length;

  const run = (fn: () => Promise<ActionState>) =>
    start(async () => {
      const res = await fn();
      setFlash(res);
      if (!res?.error) setSelected(new Set());
      setTimeout(() => setFlash(null), 3500);
    });

  if (!rows.length) {
    return (
      <EmptyState
        icon={<Users className="h-5 w-5" />}
        title={filtered ? "No clients match your filters" : "No clients yet"}
        description={filtered ? "Try a different search or tag." : "Add your first client or import a CSV to get started."}
      />
    );
  }

  return (
    <div>
      {sel.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-brand-50/60 px-4 py-2.5 text-sm" role="region" aria-label="Bulk actions">
          <span className="font-semibold">{sel.length} selected</span>
          <span className="mx-1 h-4 w-px bg-border" />
          <Select
            aria-label="Set status"
            className="h-8 w-36 text-[13px]"
            value=""
            disabled={pending}
            onChange={(e) => {
              const v = e.target.value as ClientStatus;
              if (v) run(() => bulkSetStatusAction(sel, v));
            }}
          >
            <option value="">Set status…</option>
            {CLIENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s[0]!.toUpperCase() + s.slice(1)}
              </option>
            ))}
          </Select>
          <form
            className="flex items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              if (tagInput.trim()) run(() => bulkAddTagAction(sel, tagInput));
              setTagInput("");
            }}
          >
            <Input
              aria-label="Tag to add"
              list="bulk-tags"
              placeholder="Add tag…"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              className="h-8 w-36 text-[13px]"
            />
            <datalist id="bulk-tags">
              {allTags.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
            <Button size="sm" variant="outline" disabled={pending || !tagInput.trim()}>
              <Tag className="h-3.5 w-3.5" /> Add
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pending || !tagInput.trim()}
              onClick={() => {
                run(() => bulkRemoveTagAction(sel, tagInput));
                setTagInput("");
              }}
            >
              Remove
            </Button>
          </form>
          <div className="ml-auto flex items-center gap-2">
            {confirmDelete ? (
              <>
                <span className="text-danger">Delete {sel.length} and all their data?</span>
                <Button
                  size="sm"
                  variant="danger"
                  disabled={pending}
                  onClick={() => {
                    setConfirmDelete(false);
                    run(() => bulkDeleteAction(sel));
                  }}
                >
                  Yes, delete
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
                  Cancel
                </Button>
              </>
            ) : (
              <Button size="sm" variant="ghost" className="text-danger" disabled={pending} onClick={() => setConfirmDelete(true)}>
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </Button>
            )}
            <Button size="icon" variant="ghost" aria-label="Clear selection" onClick={() => setSelected(new Set())}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
      {flash && (
        <div
          role="status"
          className={`flex items-center gap-2 border-b border-border px-4 py-2 text-sm ${flash.error ? "bg-red-50 text-danger" : "bg-green-50 text-green-700"}`}
        >
          {!flash.error && <CheckCircle2 className="h-4 w-4" />} {flash.error ?? flash.message}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="bg-surface-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">
              <th className="w-10 border-b border-border px-4 py-3">
                <input
                  type="checkbox"
                  aria-label="Select all on this page"
                  className="h-4 w-4 accent-[var(--brand)]"
                  checked={allChecked}
                  ref={(el) => {
                    if (el) el.indeterminate = sel.length > 0 && !allChecked;
                  }}
                  onChange={() => setSelected(allChecked ? new Set() : new Set(rows.map((r) => r.id)))}
                />
              </th>
              <th className="border-b border-border px-4 py-3">Client</th>
              <th className="border-b border-border px-4 py-3">Status</th>
              <th className="border-b border-border px-4 py-3">Tags</th>
              <th className="border-b border-border px-4 py-3 text-right">Services</th>
              <th className="border-b border-border px-4 py-3 text-right">Open balance</th>
              <th className="border-b border-border px-4 py-3">Last contacted</th>
              <th className="border-b border-border px-4 py-3">Created</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const checked = selected.has(r.id);
              return (
                <tr key={r.id} className={`group transition-colors ${checked ? "bg-brand-50/50" : "hover:bg-surface-2"}`}>
                  <td className="border-b border-border px-4 py-3">
                    <input
                      type="checkbox"
                      aria-label={`Select ${r.name}`}
                      className="h-4 w-4 accent-[var(--brand)]"
                      checked={checked}
                      onChange={() => {
                        const next = new Set(selected);
                        if (checked) next.delete(r.id);
                        else next.add(r.id);
                        setSelected(next);
                      }}
                    />
                  </td>
                  <td className="border-b border-border px-4 py-3">
                    <Link href={`/clients/${r.id}`} className="flex items-center gap-3">
                      <Avatar name={r.name} size={34} />
                      <div className="min-w-0">
                        <p className="truncate font-semibold group-hover:text-brand">{r.name}</p>
                        <p className="truncate text-xs text-muted">{r.company || r.email}</p>
                      </div>
                    </Link>
                  </td>
                  <td className="border-b border-border px-4 py-3">
                    <Badge tone={statusTone(r.status)}>{r.status}</Badge>
                  </td>
                  <td className="border-b border-border px-4 py-3">
                    <div className="flex max-w-56 flex-wrap gap-1">
                      {r.tags.slice(0, 3).map((t) => (
                        <span key={t} className="rounded-md border border-border bg-surface-2 px-1.5 py-0.5 text-[11px] text-foreground/80">
                          {t}
                        </span>
                      ))}
                      {r.tags.length > 3 && <span className="text-[11px] text-muted">+{r.tags.length - 3}</span>}
                    </div>
                  </td>
                  <td className="border-b border-border px-4 py-3 text-right tabular-nums">{r.services || <span className="text-muted">—</span>}</td>
                  <td className="border-b border-border px-4 py-3 text-right tabular-nums">
                    {r.balance > 0 ? <span className="font-semibold">{money(r.balance)}</span> : <span className="text-muted">—</span>}
                  </td>
                  <td className="border-b border-border px-4 py-3 text-muted">
                    {r.lastContactedAt ? formatDistanceToNowStrict(new Date(r.lastContactedAt), { addSuffix: true }) : "Never"}
                  </td>
                  <td className="border-b border-border px-4 py-3 text-muted">{fmtDate(r.createdAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
