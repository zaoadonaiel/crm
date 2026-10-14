"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, CircleDashed, Copy, Loader2, Play, Send } from "lucide-react";
import { Button, Card, CardHeader, Input } from "@/components/ui";
import { runJobsNow, sendTestTransactional } from "@/app/(admin)/settings/actions";

export type Integration = { name: string; ok: boolean; detail: string };

export function Integrations({ items, webhooks }: { items: Integration[]; webhooks: { label: string; url: string }[] }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  const [to, setTo] = useState("");
  const [testResult, setTestResult] = useState<string | null>(null);

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Integrations" description="Configured through environment variables / Cloudflare secrets" />
        <ul className="divide-y divide-border">
          {items.map((i) => (
            <li key={i.name} className="flex items-center gap-3 px-5 py-3 text-sm">
              {i.ok ? <CheckCircle2 className="h-5 w-5 text-success" /> : <CircleDashed className="h-5 w-5 text-muted" />}
              <span className="w-36 font-medium">{i.name}</span>
              <span className="text-muted">{i.detail}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <CardHeader title="Webhook URLs" description="Paste these into Resend / Mailgun / Stripe" />
        <ul className="divide-y divide-border">
          {webhooks.map((w) => (
            <li key={w.label} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
              <span className="w-40 font-medium">{w.label}</span>
              <code className="min-w-0 flex-1 truncate rounded bg-surface-2 px-2 py-1 text-xs">{w.url}</code>
              <button className="text-muted hover:text-brand" onClick={() => navigator.clipboard.writeText(w.url)} title="Copy">
                <Copy className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <CardHeader title="Test & run" description="Check email delivery and run background jobs on demand" />
        <div className="space-y-4 p-5">
          <div className="flex flex-wrap gap-2">
            <Input className="max-w-xs" type="email" placeholder="you@gmail.com" value={to} onChange={(e) => setTo(e.target.value)} />
            <Button
              variant="outline"
              disabled={!to || pending}
              onClick={() =>
                start(async () => {
                  const r = await sendTestTransactional(to);
                  setTestResult(r.ok ? `Sent via ${r.provider}${r.provider === "console" ? " (no API key set: printed to the server log)" : ""}` : `Failed: ${r.error}`);
                })
              }
            >
              <Send className="h-4 w-4" /> Send test email
            </Button>
          </div>
          {testResult && <p className="text-sm text-muted">{testResult}</p>}
          <div>
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await runJobsNow();
                  setResult(JSON.stringify(r, null, 2));
                })
              }
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Run scheduled jobs now
            </Button>
            <p className="mt-1 text-xs text-muted">Sends due follow-ups, scheduled campaigns and invoice reminders. Trigger.dev runs these automatically.</p>
          </div>
          {result && <pre className="max-h-64 overflow-auto rounded-lg bg-surface-2 p-3 text-xs">{result}</pre>}
        </div>
      </Card>
    </div>
  );
}
