"use client";

import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, AlertTriangle, CalendarClock, CheckCircle2, Info, Loader2, Rocket, Send, TestTube2 } from "lucide-react";
import { Button, Card, CardHeader, Input } from "@/components/ui";
import { describeAudience } from "@/lib/campaigns/audience-meta";
import type { Check } from "@/lib/campaigns/deliverability";
import { cn } from "@/lib/utils";
import { scheduleCampaign, sendNow, sendTest, unscheduleCampaign } from "@/app/(admin)/campaigns/actions";
import type { AudienceCount } from "./audience-editor";
import { Modal } from "./modal";
import type { BuilderCampaign, BuilderSettings } from "./types";

type Tab = "content" | "settings" | "audience" | "review";

function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const levelIcon = {
  error: <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />,
  warning: <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />,
  info: <Info className="h-4 w-4 shrink-0 text-blue-600" />,
};

export function ReviewSend({
  campaign,
  settings,
  count,
  checks,
  flush,
  goTo,
  defaultTestEmail,
}: {
  campaign: BuilderCampaign;
  settings: BuilderSettings;
  count: AudienceCount;
  checks: Check[];
  flush: () => Promise<boolean>;
  goTo: (tab: Tab) => void;
  defaultTestEmail: string;
}) {
  const router = useRouter();
  const [testTo, setTestTo] = useState(defaultTestEmail);
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, startTest] = useTransition();

  const [mode, setMode] = useState<"now" | "later">(campaign.status === "scheduled" ? "later" : "now");
  const [when, setWhen] = useState(() =>
    campaign.scheduledAt ? toLocalInput(new Date(campaign.scheduledAt)) : toLocalInput(new Date(Date.now() + 24 * 3600 * 1000)),
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sending, startSend] = useTransition();

  const errors = checks.filter((c) => c.level === "error");
  const blocked = errors.length > 0 || count.loading || !count.count;
  const fromName = campaign.fromName || settings.fromName || settings.businessName;
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  function runTest(e: FormEvent) {
    e.preventDefault();
    setTestMsg(null);
    startTest(async () => {
      if (!(await flush())) return setTestMsg({ ok: false, text: "Couldn't save your latest changes — try again." });
      const res = await sendTest(campaign.id, testTo);
      setTestMsg(res.ok ? { ok: true, text: `Test sent to ${res.to}. Check your inbox (and spam folder).` } : { ok: false, text: res.error });
    });
  }

  function confirmSend() {
    setSendError(null);
    startSend(async () => {
      if (!(await flush())) return setSendError("Couldn't save your latest changes — try again.");
      const res = mode === "now" ? await sendNow(campaign.id) : await scheduleCampaign(campaign.id, new Date(when).toISOString());
      if (!res.ok) return setSendError(res.error);
      setConfirmOpen(false);
      router.refresh();
    });
  }

  function cancelSchedule() {
    startSend(async () => {
      const res = await unscheduleCampaign(campaign.id);
      if (!res.ok) setSendError(res.error);
      router.refresh();
    });
  }

  const summary: { label: string; value: ReactNode; tab: Tab }[] = [
    { label: "From", value: `${fromName} <${settings.fromEmail}>`, tab: "settings" },
    { label: "Subject", value: campaign.subject || <span className="text-danger">Missing</span>, tab: "settings" },
    { label: "Preview text", value: campaign.previewText || <span className="text-muted">None</span>, tab: "settings" },
    {
      label: "To",
      value: (
        <>
          {describeAudience(campaign.audience)} ·{" "}
          <span className="font-semibold">{count.loading ? "counting…" : `${count.count ?? 0} recipient${count.count === 1 ? "" : "s"}`}</span>
        </>
      ),
      tab: "audience",
    },
    { label: "Replies", value: campaign.trackReplies ? "Tracked in Inbox" : "Not tracked", tab: "settings" },
  ];

  return (
    <div className="scroll-thin flex-1 overflow-y-auto">
      <div className="mx-auto grid max-w-5xl gap-6 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Summary" />
            <dl className="divide-y divide-border">
              {summary.map((row) => (
                <div key={row.label} className="flex items-start gap-4 px-5 py-3">
                  <dt className="w-24 shrink-0 text-[13px] text-muted">{row.label}</dt>
                  <dd className="min-w-0 flex-1 text-[14px] break-words">{row.value}</dd>
                  <button type="button" onClick={() => goTo(row.tab)} className="text-[13px] font-medium text-brand hover:underline">
                    Edit
                  </button>
                </div>
              ))}
            </dl>
          </Card>

          <Card>
            <CardHeader
              title="Deliverability check"
              description={checks.length ? `${errors.length} to fix · ${checks.length - errors.length} suggestions` : "Looking good"}
            />
            {checks.length ? (
              <ul className="divide-y divide-border">
                {checks.map((c, i) => (
                  <li key={i} className="flex items-start gap-3 px-5 py-3 text-[13px]">
                    {levelIcon[c.level]}
                    <span className="flex-1">{c.message}</span>
                    {c.tab && (
                      <button type="button" onClick={() => goTo(c.tab!)} className="shrink-0 font-medium text-brand hover:underline">
                        Fix
                      </button>
                    )}
                    {c.href && (
                      <Link href={c.href} className="shrink-0 font-medium text-brand hover:underline">
                        Open settings
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex items-center gap-3 px-5 py-4 text-[14px] text-green-700">
                <CheckCircle2 className="h-5 w-5" /> No issues found. Nice work.
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Send a test" icon={<TestTube2 className="h-5 w-5" />} />
            <form onSubmit={runTest} className="space-y-3 p-5">
              <label htmlFor="test-to" className="sr-only">
                Test email address
              </label>
              <Input id="test-to" type="text" inputMode="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="you@example.com" />
              <Button type="submit" variant="outline" disabled={testing || !testTo.trim()} className="w-full justify-center">
                {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Send test email
              </Button>
              <p className="text-[11px] text-muted">Separate up to 5 addresses with commas. Merge tags use the contact&apos;s data if they&apos;re in your CRM.</p>
              {testMsg && (
                <p role="status" className={cn("text-[13px]", testMsg.ok ? "text-green-700" : "text-danger")}>
                  {testMsg.text}
                </p>
              )}
            </form>
          </Card>

          <Card>
            <CardHeader title={campaign.status === "scheduled" ? "Scheduled" : "Send"} icon={<Rocket className="h-5 w-5" />} />
            <div className="space-y-4 p-5">
              {campaign.status === "scheduled" && campaign.scheduledAt && (
                <div className="rounded-lg border border-purple-200 bg-purple-50 p-3 text-[13px] text-purple-800">
                  Scheduled for{" "}
                  <strong>
                    {new Date(campaign.scheduledAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                  </strong>
                  . Edits you make are saved and included.
                  <button type="button" onClick={cancelSchedule} disabled={sending} className="mt-2 block font-semibold underline">
                    Cancel schedule
                  </button>
                </div>
              )}
              <div role="radiogroup" aria-label="When to send" className="grid grid-cols-2 gap-2">
                {(
                  [
                    ["now", "Send now", Send],
                    ["later", "Schedule", CalendarClock],
                  ] as const
                ).map(([v, label, Icon]) => (
                  <button
                    key={v}
                    type="button"
                    role="radio"
                    aria-checked={mode === v}
                    onClick={() => setMode(v)}
                    className={cn(
                      "flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-[13px] font-medium transition",
                      mode === v ? "border-brand bg-brand-50 text-brand-600" : "border-border hover:bg-surface-2",
                    )}
                  >
                    <Icon className="h-4 w-4" /> {label}
                  </button>
                ))}
              </div>
              {mode === "later" && (
                <div>
                  <label htmlFor="send-at" className="mb-1.5 block text-[13px] font-medium">
                    Date & time <span className="font-normal text-muted">({tz})</span>
                  </label>
                  <Input id="send-at" type="datetime-local" value={when} min={toLocalInput(new Date())} onChange={(e) => setWhen(e.target.value)} />
                  <p className="mt-1 text-[11px] text-muted">Tip: Tuesday–Thursday mornings usually get the best open rates.</p>
                </div>
              )}
              <Button type="button" size="lg" className="w-full justify-center" disabled={blocked || sending} onClick={() => setConfirmOpen(true)}>
                {mode === "now" ? <Send className="h-4 w-4" /> : <CalendarClock className="h-4 w-4" />}
                {mode === "now" ? `Send to ${count.count ?? 0} ${count.count === 1 ? "person" : "people"}` : campaign.status === "scheduled" ? "Update schedule" : "Schedule campaign"}
              </Button>
              {blocked && !count.loading && <p className="text-center text-xs text-danger">Fix the issues marked in red before sending.</p>}
              {sendError && !confirmOpen && (
                <p role="alert" className="text-[13px] text-danger">
                  {sendError}
                </p>
              )}
            </div>
          </Card>
        </div>
      </div>

      <Modal
        open={confirmOpen}
        onClose={() => !sending && setConfirmOpen(false)}
        title={mode === "now" ? "Send this campaign now?" : "Schedule this campaign?"}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)} disabled={sending}>
              Cancel
            </Button>
            <Button onClick={confirmSend} disabled={sending} data-autofocus>
              {sending && <Loader2 className="h-4 w-4 animate-spin" />}
              {mode === "now" ? "Yes, send it" : "Schedule"}
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-[14px]">
          <p>
            <strong>“{campaign.subject}”</strong> will be sent to <strong>{count.count ?? 0}</strong> {count.count === 1 ? "person" : "people"}
            {mode === "later" && when ? (
              <>
                {" "}
                on <strong>{new Date(when).toLocaleString(undefined, { dateStyle: "full", timeStyle: "short" })}</strong>
              </>
            ) : null}
            .
          </p>
          {checks.some((c) => c.level === "warning") && (
            <p className="flex gap-2 rounded-lg bg-amber-50 p-3 text-[13px] text-amber-800">
              <AlertTriangle className="h-4 w-4 shrink-0" /> There {checks.filter((c) => c.level === "warning").length === 1 ? "is 1 warning" : `are ${checks.filter((c) => c.level === "warning").length} warnings`} in the
              deliverability check.
            </p>
          )}
          {mode === "now" && <p className="text-[13px] text-muted">This can&apos;t be undone once sending starts.</p>}
          {sendError && (
            <p role="alert" className="text-[13px] text-danger">
              {sendError}
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}
