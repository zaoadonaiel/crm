"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import { Check, Copy, CopyPlus, ExternalLink, Eye, Pencil, Send, ThumbsDown, ThumbsUp, Trash2 } from "lucide-react";
import type { ProposalStatus } from "@/db/schema";
import { Badge, Button, Card, Field, Input, Label, Select, Textarea } from "@/components/ui";
import { FormMessage, SubmitButton } from "@/components/crm/form-bits";
import { statusTone } from "@/lib/status";
import { cn, money } from "@/lib/utils";
import { centsToInput, fmtDate, parseMoneyToCents } from "@/lib/billing/format";
import { markdownClass, renderMarkdown } from "@/lib/markdown";
import {
  deleteProposalAction,
  duplicateProposalAction,
  markProposalAction,
  saveProposalAction,
  type ProposalActionState,
} from "../actions";

type P = {
  id: string;
  title: string;
  clientId: string;
  clientName: string;
  clientEmail: string;
  amount: number;
  currency: string;
  body: string;
  status: ProposalStatus;
  autoFollowUp: boolean;
  sentAt: string | null;
  viewedAt: string | null;
  respondedAt: string | null;
  createdAt: string;
  publicUrl: string;
};

const TEMPLATE = `# Overview
A short summary of what you'll deliver and why it matters to them.

## Scope
- Discovery & planning
- Design (2 rounds of revisions)
- Build & launch

## Timeline
About **4 weeks** from kickoff.

## Investment
One-time project fee, plus hosting at $49/month.

## Next steps
Click **Accept** below and I'll send the first invoice and a kickoff invite.`;

export function ProposalEditor({ proposal: p, clients }: { proposal: P; clients: { id: string; name: string; company: string | null }[] }) {
  const [state, action] = useActionState<ProposalActionState, FormData>(saveProposalAction.bind(null, p.id), null);
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [body, setBody] = useState(p.body);
  const [title, setTitle] = useState(p.title);
  const [amount, setAmount] = useState(centsToInput(p.amount));
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  const preview = useMemo(() => (tab === "preview" ? renderMarkdown(body) : ""), [tab, body]);
  const locked = p.status === "accepted" || p.status === "declined";
  const cents = parseMoneyToCents(amount);

  const steps: { label: string; at: string | null }[] = [
    { label: "Created", at: p.createdAt },
    { label: "Sent", at: p.sentAt },
    { label: "Viewed", at: p.viewedAt },
    { label: p.status === "declined" ? "Declined" : "Accepted", at: p.respondedAt },
  ];

  return (
    <form action={action} className="grid gap-6 p-4 sm:p-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-4">
        <Card className="p-5">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Badge tone={statusTone(p.status)}>{p.status}</Badge>
            <span className="text-xs text-muted">for {p.clientName}</span>
          </div>
          <Label htmlFor="title" className="sr-only">
            Title
          </Label>
          <input
            id="title"
            name="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            placeholder="Proposal title"
            className="w-full bg-transparent text-2xl font-bold tracking-tight outline-none placeholder:text-muted/60"
          />
        </Card>

        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-3">
            <div role="tablist" aria-label="Editor mode" className="flex">
              {(["write", "preview"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => setTab(t)}
                  className={cn(
                    "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm capitalize",
                    tab === t ? "border-brand font-semibold" : "border-transparent text-muted hover:text-foreground",
                  )}
                >
                  {t === "write" ? <Pencil className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  {t}
                </button>
              ))}
            </div>
            {!body.trim() && (
              <Button type="button" size="sm" variant="ghost" onClick={() => setBody(TEMPLATE)}>
                Use template
              </Button>
            )}
          </div>
          <input type="hidden" name="body" value={body} />
          {tab === "write" ? (
            <div>
              <Textarea
                aria-label="Proposal body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={22}
                placeholder="Write your proposal… Markdown supported: # Heading, **bold**, - lists, [links](https://…)"
                className="min-h-[28rem] rounded-none border-0 font-mono text-[13px] leading-relaxed focus:ring-0"
              />
              <p className="border-t border-border px-4 py-2 text-xs text-muted">
                Markdown: <code># Heading</code> · <code>**bold**</code> · <code>*italic*</code> · <code>- list</code> · <code>[link](https://…)</code> ·{" "}
                <code>---</code>
              </p>
            </div>
          ) : (
            <div className="min-h-[28rem] px-6 py-6 sm:px-10">
              <h1 className="mb-6 text-3xl font-bold tracking-tight">{title || "Untitled proposal"}</h1>
              {body.trim() ? (
                <div className={markdownClass} dangerouslySetInnerHTML={{ __html: preview }} />
              ) : (
                <p className="text-muted">Nothing to preview yet.</p>
              )}
              <div className="mt-10 flex items-center justify-between rounded-xl bg-brand-50 px-5 py-4">
                <span className="font-medium">Total investment</span>
                <span className="text-xl font-bold">{Number.isNaN(cents) ? "—" : money(cents, p.currency)}</span>
              </div>
            </div>
          )}
        </Card>
      </div>

      <aside className="space-y-4">
        <Card className="space-y-4 p-5">
          <Field label="Client">
            <Select name="clientId" defaultValue={p.clientId} disabled={locked}>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.company ? ` — ${c.company}` : ""}
                </option>
              ))}
            </Select>
            {locked && <input type="hidden" name="clientId" value={p.clientId} />}
          </Field>
          <Field label="Amount (USD)">
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">$</span>
              <Input
                name="amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                readOnly={locked}
                className="pl-7"
                aria-invalid={Number.isNaN(cents)}
              />
            </div>
          </Field>
          <label className="flex items-start gap-2.5 text-sm">
            <input type="checkbox" name="autoFollowUp" defaultChecked={p.autoFollowUp} className="mt-0.5 h-4 w-4 accent-[var(--brand)]" />
            <span>
              <span className="font-medium">Auto follow-up</span>
              <span className="block text-xs text-muted">Enroll in your “proposal sent” sequence until they respond.</span>
            </span>
          </label>

          <FormMessage state={state} />

          <div className="flex flex-col gap-2">
            {!locked && (
              <SubmitButton name="intent" value="send" pendingText="Sending…" className="w-full justify-center">
                <Send className="h-4 w-4" /> {p.status === "draft" ? "Send proposal" : "Resend proposal"}
              </SubmitButton>
            )}
            <SubmitButton name="intent" value="save" variant="outline" pendingText="Saving…" className="w-full justify-center">
              Save changes
            </SubmitButton>
          </div>
          {!locked && <p className="text-xs text-muted">Emails {p.clientEmail} a branded link to review and accept.</p>}
        </Card>

        <Card className="p-5">
          <p className="mb-2 text-[13px] font-medium">Client link</p>
          <div className="flex gap-2">
            <Input readOnly value={p.publicUrl} aria-label="Public proposal link" className="text-xs" onFocus={(e) => e.currentTarget.select()} />
            <Button
              type="button"
              size="icon"
              variant="outline"
              aria-label="Copy link"
              onClick={async () => {
                await navigator.clipboard.writeText(p.publicUrl);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <a href={p.publicUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline">
            Open client view <ExternalLink className="h-3 w-3" />
          </a>
        </Card>

        <Card className="p-5">
          <p className="mb-3 text-[13px] font-medium">Timeline</p>
          <ol className="space-y-2.5">
            {steps.map((s) => (
              <li key={s.label} className="flex items-center gap-2.5 text-sm">
                <span className={cn("h-2.5 w-2.5 rounded-full", s.at ? "bg-brand" : "border border-border bg-surface")} aria-hidden />
                <span className={s.at ? "" : "text-muted"}>{s.label}</span>
                <span className="ml-auto text-xs text-muted">{s.at ? fmtDate(s.at) : "—"}</span>
              </li>
            ))}
          </ol>
        </Card>

        <Card className="space-y-2 p-5">
          {!locked && p.status !== "draft" && (
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="outline" className="flex-1 justify-center" disabled={pending} onClick={() => start(() => markProposalAction(p.id, "accepted"))}>
                <ThumbsUp className="h-3.5 w-3.5" /> Mark accepted
              </Button>
              <Button type="button" size="sm" variant="outline" className="flex-1 justify-center" disabled={pending} onClick={() => start(() => markProposalAction(p.id, "declined"))}>
                <ThumbsDown className="h-3.5 w-3.5" /> Declined
              </Button>
            </div>
          )}
          <Button type="button" size="sm" variant="ghost" className="w-full justify-center" disabled={pending} onClick={() => start(() => duplicateProposalAction(p.id))}>
            <CopyPlus className="h-3.5 w-3.5" /> Duplicate
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="w-full justify-center text-danger"
            disabled={pending}
            onClick={() => {
              if (confirm("Delete this proposal? The client link will stop working.")) start(() => deleteProposalAction(p.id));
            }}
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete proposal
          </Button>
        </Card>
      </aside>
    </form>
  );
}
