"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Check, Loader2, Search, ShieldCheck, Tag, Users } from "lucide-react";
import { CLIENT_STATUSES, type Audience, type ClientStatus } from "@/db/schema";
import { Avatar, Badge, Card, CardHeader, Input } from "@/components/ui";
import { AUDIENCE_MODES, SEGMENTS } from "@/lib/campaigns/audience-meta";
import { statusTone } from "@/lib/status";
import { cn } from "@/lib/utils";
import type { ClientOption } from "./types";

export type AudienceCount = { loading: boolean; count: number | null; error?: string };

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium capitalize transition",
        active ? "border-brand bg-brand-50 text-brand-600" : "border-border bg-surface text-foreground/80 hover:bg-surface-2",
      )}
    >
      {active && <Check className="h-3.5 w-3.5" />}
      {children}
    </button>
  );
}

export function AudienceCountBadge({ state }: { state: AudienceCount }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3" aria-live="polite">
      <div className="grid h-10 w-10 place-items-center rounded-lg bg-brand-50 text-brand">
        {state.loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Users className="h-5 w-5" />}
      </div>
      <div>
        <p className="text-2xl leading-none font-bold tabular-nums">{state.count ?? "—"}</p>
        <p className="mt-1 text-xs text-muted">{state.error ? state.error : `recipient${state.count === 1 ? "" : "s"} · unsubscribes excluded`}</p>
      </div>
    </div>
  );
}

export function AudienceEditor({
  audience,
  onChange,
  clients,
  tags,
  count,
}: {
  audience: Audience;
  onChange: (a: Audience) => void;
  clients: ClientOption[];
  tags: string[];
  count: AudienceCount;
}) {
  const [query, setQuery] = useState("");
  const [showSelected, setShowSelected] = useState(false);
  const selectedIds = useMemo(() => new Set(audience.clientIds ?? []), [audience.clientIds]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = clients;
    if (showSelected) list = list.filter((c) => selectedIds.has(c.id));
    if (q) list = list.filter((c) => `${c.name} ${c.email} ${c.company ?? ""}`.toLowerCase().includes(q));
    return list.slice(0, 200);
  }, [clients, query, showSelected, selectedIds]);

  const toggle = <T,>(list: T[] | undefined, v: T) => {
    const l = list ?? [];
    return l.includes(v) ? l.filter((x) => x !== v) : [...l, v];
  };

  return (
    <div className="scroll-thin flex-1 overflow-y-auto">
      <div className="mx-auto grid max-w-5xl gap-6 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Who should receive this?" icon={<Users className="h-5 w-5" />} />
            <div role="radiogroup" aria-label="Audience type" className="grid gap-2 p-5 sm:grid-cols-2">
              {AUDIENCE_MODES.map((m) => {
                const active = audience.mode === m.value;
                return (
                  <button
                    key={m.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => onChange({ ...audience, mode: m.value })}
                    className={cn(
                      "flex items-start gap-3 rounded-xl border p-3.5 text-left transition",
                      active ? "border-brand bg-brand-50/60 ring-3 ring-brand/10" : "border-border hover:bg-surface-2",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border-2",
                        active ? "border-brand" : "border-black/20",
                      )}
                    >
                      {active && <span className="h-1.5 w-1.5 rounded-full bg-brand" />}
                    </span>
                    <span>
                      <span className="block text-[14px] font-semibold">{m.label}</span>
                      <span className="block text-[12px] text-muted">{m.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </Card>

          {audience.mode === "statuses" && (
            <Card>
              <CardHeader title="Client statuses" description="Anyone matching at least one selected status." />
              <div className="flex flex-wrap gap-2 p-5">
                {CLIENT_STATUSES.map((s) => (
                  <Chip key={s} active={!!audience.statuses?.includes(s)} onClick={() => onChange({ ...audience, statuses: toggle<ClientStatus>(audience.statuses, s) })}>
                    {s}
                  </Chip>
                ))}
              </div>
            </Card>
          )}

          {audience.mode === "tags" && (
            <Card>
              <CardHeader title="Tags" description="Anyone with at least one of these tags." icon={<Tag className="h-5 w-5" />} />
              <div className="flex flex-wrap gap-2 p-5">
                {tags.length ? (
                  tags.map((t) => (
                    <Chip key={t} active={!!audience.tags?.includes(t)} onClick={() => onChange({ ...audience, tags: toggle(audience.tags, t) })}>
                      <span className="normal-case">{t}</span>
                    </Chip>
                  ))
                ) : (
                  <p className="text-sm text-muted">No tags yet — add tags to clients to target them here.</p>
                )}
              </div>
            </Card>
          )}

          {audience.mode === "segment" && (
            <Card>
              <CardHeader title="Smart segments" description="These update automatically at send time." />
              <div role="radiogroup" aria-label="Segment" className="space-y-2 p-5">
                {SEGMENTS.map((s) => {
                  const active = audience.segment === s.value;
                  return (
                    <button
                      key={s.value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => onChange({ ...audience, segment: s.value })}
                      className={cn(
                        "flex w-full items-start gap-3 rounded-xl border p-3.5 text-left transition",
                        active ? "border-brand bg-brand-50/60" : "border-border hover:bg-surface-2",
                      )}
                    >
                      <span className={cn("mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border-2", active ? "border-brand" : "border-black/20")}>
                        {active && <span className="h-1.5 w-1.5 rounded-full bg-brand" />}
                      </span>
                      <span>
                        <span className="block text-[14px] font-semibold">{s.label}</span>
                        <span className="block text-[12px] text-muted">{s.description}</span>
                      </span>
                    </button>
                  );
                })}
                {audience.segment === "proposal_no_response" && (
                  <p className="pt-1 text-xs text-muted">
                    Tip: the <span className="font-medium text-foreground">Re-engage: checking in</span> template is written for this segment — plain,
                    personal, and replies land in your Inbox.
                  </p>
                )}
              </div>
            </Card>
          )}

          {audience.mode === "clients" && (
            <Card>
              <CardHeader
                title="Pick people"
                description={`${selectedIds.size} selected`}
                action={
                  selectedIds.size > 0 ? (
                    <button type="button" onClick={() => onChange({ ...audience, clientIds: [] })} className="text-[13px] font-medium text-muted hover:text-foreground">
                      Clear
                    </button>
                  ) : null
                }
              />
              <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
                <div className="relative min-w-48 flex-1">
                  <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" />
                  <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, email or company" className="pl-9" aria-label="Search contacts" />
                </div>
                <Chip active={showSelected} onClick={() => setShowSelected((s) => !s)}>
                  Selected only
                </Chip>
              </div>
              <ul className="scroll-thin max-h-[420px] divide-y divide-border overflow-y-auto" aria-label="Contacts">
                {filtered.map((c) => {
                  const on = selectedIds.has(c.id);
                  return (
                    <li key={c.id}>
                      <label className={cn("flex cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-surface-2", on && "bg-brand-50/40")}>
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => onChange({ ...audience, clientIds: toggle(audience.clientIds, c.id) })}
                          className="h-4 w-4 accent-[var(--brand)]"
                        />
                        <Avatar name={c.name} size={30} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] font-medium">{c.name}</span>
                          <span className="block truncate text-xs text-muted">
                            {c.email}
                            {c.company ? ` · ${c.company}` : ""}
                          </span>
                        </span>
                        <Badge tone={statusTone(c.status)}>{c.status}</Badge>
                      </label>
                    </li>
                  );
                })}
                {!filtered.length && <li className="px-4 py-8 text-center text-sm text-muted">No contacts match.</li>}
              </ul>
              {filtered.length === 200 && <p className="border-t border-border px-4 py-2 text-xs text-muted">Showing the first 200 — refine your search.</p>}
            </Card>
          )}
        </div>

        <div className="space-y-3 lg:sticky lg:top-6 lg:self-start">
          <AudienceCountBadge state={count} />
          <div className="flex gap-2 rounded-xl border border-border bg-surface p-4 text-xs text-muted">
            <ShieldCheck className="h-4 w-4 shrink-0 text-green-600" />
            <p>
              People who unsubscribed, bounced or marked you as spam are always excluded automatically, and duplicate addresses only get one
              copy.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
