"use client";

import * as React from "react";
import Link from "next/link";
import { Check, Loader2, MessagesSquare, Search, UserPlus, Users, X } from "lucide-react";
import { Avatar, Badge, Button, Card, CardHeader, EmptyState, Input } from "@/components/ui";
import { enrollClients, stopEnrollment } from "@/app/(admin)/automations/actions";
import { searchClients } from "@/app/(admin)/inbox/actions";
import { Dialog } from "@/components/inbox/overlay";
import type { ClientOption } from "@/components/inbox/types";
import { statusTone } from "@/lib/status";
import { cn } from "@/lib/utils";
import { stopReasonLabel, type SequenceTrigger } from "./constants";

export type EnrollmentRow = {
  id: string;
  status: "active" | "completed" | "stopped";
  stopReason: string | null;
  currentStep: number;
  nextRunAt: Date | null;
  refType: "proposal" | "invoice" | "manual";
  conversationId: string | null;
  createdAt: Date;
  updatedAt: Date;
  client: ClientOption;
};

type Tab = "active" | "completed" | "stopped" | "all";

function formatWhen(d: Date) {
  const diff = d.getTime() - Date.now();
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (abs < 60 * 60_000) return diff <= 0 ? "Due now" : rtf.format(Math.round(diff / 60_000), "minute");
  if (abs < 24 * 60 * 60_000) return rtf.format(Math.round(diff / 3_600_000), "hour");
  return rtf.format(Math.round(diff / 86_400_000), "day");
}

export function EnrollmentsTable({
  sequenceId,
  sequenceActive,
  trigger,
  stepCount,
  rows,
}: {
  sequenceId: string;
  sequenceActive: boolean;
  trigger: SequenceTrigger;
  stepCount: number;
  rows: EnrollmentRow[];
}) {
  const [tab, setTab] = React.useState<Tab>("active");
  const [enrollOpen, setEnrollOpen] = React.useState(false);
  const [stopping, setStopping] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [, startTransition] = React.useTransition();

  const counts = {
    active: rows.filter((r) => r.status === "active").length,
    completed: rows.filter((r) => r.status === "completed").length,
    stopped: rows.filter((r) => r.status === "stopped").length,
    all: rows.length,
  };
  const shown = tab === "all" ? rows : rows.filter((r) => r.status === tab);

  const stop = (id: string) => {
    setStopping(id);
    setError(null);
    startTransition(async () => {
      const res = await stopEnrollment(id);
      if (!res.ok) setError(res.error);
      setStopping(null);
    });
  };

  return (
    <Card>
      <CardHeader
        title="Enrollments"
        description={
          trigger === "manual"
            ? "Clients you've added to this sequence."
            : "Clients are enrolled automatically by the trigger — you can also add people manually."
        }
        icon={<Users className="h-5 w-5" />}
        action={
          <Button size="sm" variant={trigger === "manual" ? "primary" : "outline"} onClick={() => setEnrollOpen(true)}>
            <UserPlus className="h-4 w-4" /> Enroll clients
          </Button>
        }
      />
      <div role="tablist" aria-label="Filter enrollments" className="flex gap-1 overflow-x-auto border-b border-border px-4 py-2">
        {(["active", "completed", "stopped", "all"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn(
              "shrink-0 rounded-md px-2.5 py-1 text-[13px] font-medium capitalize transition-colors",
              tab === t ? "bg-brand-50 text-brand-600" : "text-muted hover:bg-black/5 hover:text-foreground",
            )}
          >
            {t} <span className="tabular-nums opacity-70">{counts[t]}</span>
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="border-b border-red-200 bg-red-50 px-5 py-2 text-[13px] text-red-700">
          {error}
        </p>
      )}
      {shown.length === 0 ? (
        <EmptyState
          icon={<Users className="h-5 w-5" />}
          title={tab === "active" ? "Nobody is in this sequence right now" : `No ${tab === "all" ? "" : tab + " "}enrollments`}
          description={
            trigger === "proposal_sent"
              ? "Clients are added automatically when you send a proposal with follow-ups enabled."
              : trigger === "invoice_sent"
                ? "Clients are added automatically when an invoice is sent."
                : "Use “Enroll clients” to start the sequence for specific people."
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-muted">
                <th className="border-b border-border bg-surface-2 px-4 py-2.5">Client</th>
                <th className="border-b border-border bg-surface-2 px-4 py-2.5">Progress</th>
                <th className="border-b border-border bg-surface-2 px-4 py-2.5">Next email</th>
                <th className="border-b border-border bg-surface-2 px-4 py-2.5">Status</th>
                <th className="border-b border-border bg-surface-2 px-4 py-2.5">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const sent = Math.min(r.currentStep, stepCount);
                return (
                  <tr key={r.id} className="hover:bg-surface-2/60">
                    <td className="border-b border-border px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={r.client.name} size={30} />
                        <div className="min-w-0">
                          <Link href={`/clients/${r.client.id}`} className="block truncate font-medium hover:text-brand">
                            {r.client.name}
                          </Link>
                          <p className="truncate text-xs text-muted">{r.client.company || r.client.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="border-b border-border px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex gap-0.5" aria-hidden>
                          {Array.from({ length: stepCount }, (_, i) => (
                            <span key={i} className={cn("h-1.5 w-4 rounded-full", i < sent ? "bg-brand" : "bg-black/10")} />
                          ))}
                        </div>
                        <span className="text-xs text-muted">
                          {sent}/{stepCount} sent
                        </span>
                      </div>
                    </td>
                    <td className="border-b border-border px-4 py-3 text-[13px]">
                      {r.status === "active" && r.nextRunAt ? (
                        <span title={r.nextRunAt.toLocaleString()} suppressHydrationWarning>
                          Step {Math.min(r.currentStep + 1, stepCount)} · {formatWhen(r.nextRunAt)}
                          {!sequenceActive && <span className="ml-1 text-xs text-amber-700">(paused)</span>}
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="border-b border-border px-4 py-3">
                      <div className="flex flex-col items-start gap-0.5">
                        <Badge tone={statusTone(r.status)}>{r.status}</Badge>
                        {r.status === "stopped" && r.stopReason && <span className="text-xs text-muted">{stopReasonLabel(r.stopReason)}</span>}
                      </div>
                    </td>
                    <td className="border-b border-border px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {r.conversationId && (
                          <Link
                            href={`/inbox?c=${r.conversationId}`}
                            className="rounded-md p-1.5 text-muted hover:bg-black/5 hover:text-foreground"
                            title="Open conversation"
                            aria-label={`Open conversation with ${r.client.name}`}
                          >
                            <MessagesSquare className="h-4 w-4" />
                          </Link>
                        )}
                        {r.status === "active" && (
                          <Button size="sm" variant="ghost" disabled={stopping === r.id} onClick={() => stop(r.id)}>
                            {stopping === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                            Stop
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <EnrollDialog
        open={enrollOpen}
        onClose={() => setEnrollOpen(false)}
        sequenceId={sequenceId}
        activeClientIds={new Set(rows.filter((r) => r.status === "active").map((r) => r.client.id))}
      />
    </Card>
  );
}

function EnrollDialog({
  open,
  onClose,
  sequenceId,
  activeClientIds,
}: {
  open: boolean;
  onClose: () => void;
  sequenceId: string;
  activeClientIds: Set<string>;
}) {
  return (
    <Dialog open={open} onClose={onClose} title="Enroll clients" description="The first step goes out after its delay. Already-active clients are skipped.">
      {open && <EnrollForm sequenceId={sequenceId} activeClientIds={activeClientIds} onDone={onClose} />}
    </Dialog>
  );
}

function EnrollForm({ sequenceId, activeClientIds, onDone }: { sequenceId: string; activeClientIds: Set<string>; onDone: () => void }) {
  const [q, setQ] = React.useState("");
  const [results, setResults] = React.useState<ClientOption[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [selected, setSelected] = React.useState<Map<string, ClientOption>>(new Map());
  const [pending, startTransition] = React.useTransition();
  const [message, setMessage] = React.useState<{ ok: boolean; text: string } | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await searchClients(q, 25);
        if (!cancelled) setResults(r);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q]);

  const toggle = (c: ClientOption) =>
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(c.id)) next.delete(c.id);
      else next.set(c.id, c);
      return next;
    });

  const submit = () => {
    setMessage(null);
    startTransition(async () => {
      const res = await enrollClients(sequenceId, [...selected.keys()]);
      if (!res.ok) {
        setMessage({ ok: false, text: res.error });
        return;
      }
      const { enrolled, alreadyActive, suppressed } = res.data;
      const extra = [alreadyActive && `${alreadyActive} already active`, suppressed && `${suppressed} suppressed`].filter(Boolean).join(", ");
      if (enrolled > 0 && !extra) onDone();
      else setMessage({ ok: enrolled > 0, text: `Enrolled ${enrolled}${extra ? ` (${extra} skipped)` : ""}.` });
      setSelected(new Map());
    });
  };

  return (
    <div className="space-y-3">
      {selected.size > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {[...selected.values()].map((c) => (
            <span key={c.id} className="inline-flex items-center gap-1 rounded-full bg-brand-50 py-0.5 pl-2.5 pr-1 text-xs font-medium text-brand-600">
              {c.name}
              <button type="button" onClick={() => toggle(c)} className="rounded-full p-0.5 hover:bg-brand-100" aria-label={`Remove ${c.name}`}>
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search clients…" className="pl-9" aria-label="Search clients" />
        {loading && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted" />}
      </div>
      <ul className="max-h-64 divide-y divide-border overflow-y-auto rounded-lg border border-border" aria-label="Clients">
        {results.length === 0 && !loading && <li className="px-3 py-6 text-center text-sm text-muted">No clients found.</li>}
        {results.map((c) => {
          const already = activeClientIds.has(c.id);
          const checked = selected.has(c.id);
          return (
            <li key={c.id}>
              <label className={cn("flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-surface-2", already && "cursor-not-allowed opacity-60")}>
                <input type="checkbox" checked={checked} disabled={already} onChange={() => toggle(c)} className="h-4 w-4 accent-[var(--brand)]" />
                <Avatar name={c.name} size={28} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{c.name}</span>
                  <span className="block truncate text-xs text-muted">{c.email}</span>
                </span>
                {already && <Badge tone="blue">In sequence</Badge>}
                {checked && <Check className="h-4 w-4 text-brand" />}
              </label>
            </li>
          );
        })}
      </ul>
      {message && (
        <p role="status" className={cn("text-sm", message.ok ? "text-green-700" : "text-danger")}>
          {message.text}
        </p>
      )}
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" onClick={onDone}>
          {message?.ok ? "Done" : "Cancel"}
        </Button>
        <Button type="button" onClick={submit} disabled={pending || selected.size === 0}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          Enroll {selected.size || ""} {selected.size === 1 ? "client" : "clients"}
        </Button>
      </div>
    </div>
  );
}
