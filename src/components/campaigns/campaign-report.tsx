import Link from "next/link";
import { ArrowLeft, Check, Copy, Eye, Loader2, MailCheck, MessageSquareReply, MousePointerClick, Send, TriangleAlert, Users } from "lucide-react";
import type { campaignRecipients, campaigns } from "@/db/schema";
import { Avatar, Badge, Button, Card, CardHeader, EmptyState, Table, Td, Th } from "@/components/ui";
import { describeAudience } from "@/lib/campaigns/audience-meta";
import { renderCampaign, type CampaignRenderSettings } from "@/lib/email/render-campaign";
import { statusTone } from "@/lib/status";
import { duplicateCampaign } from "@/app/(admin)/campaigns/actions";
import { EmailPreview } from "./email-preview";
import { AutoRefresh } from "./list-actions";

type Campaign = typeof campaigns.$inferSelect;
type Recipient = typeof campaignRecipients.$inferSelect & {
  client: { id: string; name: string; company: string | null } | null;
};

function pct(n: number, d: number) {
  return d ? `${Math.round((n / d) * 1000) / 10}%` : "—";
}

function fmt(d: Date | null) {
  return d ? d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";
}

function Tick({ at, label }: { at: Date | null; label: string }) {
  return at ? (
    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-green-50 text-green-700" title={`${label} ${fmt(at)}`}>
      <Check className="h-3.5 w-3.5" aria-label={`${label} ${fmt(at)}`} />
    </span>
  ) : (
    <span className="text-muted/50" aria-label={`Not ${label.toLowerCase()}`}>
      –
    </span>
  );
}

export function CampaignReport({
  campaign,
  recipients,
  settings,
}: {
  campaign: Campaign;
  recipients: Recipient[];
  settings: CampaignRenderSettings;
}) {
  const inProgress = campaign.status === "sending" || campaign.status === "scheduled";
  const total = recipients.length;
  const delivered = recipients.filter((r) => !["queued", "failed", "skipped", "bounced"].includes(r.status)).length;
  const opened = recipients.filter((r) => r.openedAt || r.status === "opened" || r.status === "clicked").length;
  const clicked = recipients.filter((r) => r.clickedAt || r.status === "clicked").length;
  const replied = recipients.filter((r) => r.repliedAt).length;
  const failed = recipients.filter((r) => ["failed", "bounced", "complained"].includes(r.status)).length;
  const queued = recipients.filter((r) => r.status === "queued").length;

  const html = renderCampaign({
    blocks: campaign.blocks,
    theme: campaign.theme,
    subject: campaign.subject,
    previewText: campaign.previewText,
    vars: { first_name: "Alex", name: "Alex Sample", company: "Sample Co", email: "alex@example.com" },
    unsubscribeUrl: "#",
    settings,
  }).html;

  const stats = [
    { label: "Recipients", value: total, sub: describeAudience(campaign.audience), icon: Users },
    { label: "Delivered", value: delivered, sub: pct(delivered, total), icon: MailCheck },
    { label: "Opened", value: pct(opened, delivered), sub: `${opened} people`, icon: Eye },
    { label: "Clicked", value: pct(clicked, delivered), sub: `${clicked} people`, icon: MousePointerClick },
    { label: "Replied", value: replied, sub: pct(replied, delivered), icon: MessageSquareReply },
  ];

  return (
    <div>
      {inProgress && <AutoRefresh />}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border bg-surface px-4 py-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/campaigns" className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-black/5 hover:text-foreground" aria-label="Back to campaigns">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-[17px] font-semibold">
              <span className="truncate">{campaign.name}</span>
              <Badge tone={statusTone(campaign.status)}>{campaign.status === "scheduled" ? "queued" : campaign.status}</Badge>
            </h1>
            <p className="truncate text-[13px] text-muted">
              {campaign.subject}
              {campaign.sentAt ? ` · Sent ${fmt(campaign.sentAt)}` : ""}
            </p>
          </div>
        </div>
        <form action={duplicateCampaign.bind(null, campaign.id)}>
          <Button type="submit" variant="outline">
            <Copy className="h-4 w-4" /> Duplicate
          </Button>
        </form>
      </div>

      <div className="space-y-6 p-4 sm:p-6">
        {inProgress && (
          <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[14px] text-amber-800" role="status">
            <Loader2 className="h-4 w-4 animate-spin" />
            {campaign.status === "scheduled"
              ? "Queued — sending will start in a moment."
              : `Sending… ${total - queued} of ${total || "?"} processed. This page updates automatically.`}
          </div>
        )}
        {campaign.status === "failed" && (
          <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[14px] text-red-700" role="alert">
            <TriangleAlert className="h-4 w-4" /> This campaign failed to send. Check your email provider settings, then duplicate it to try again.
          </div>
        )}

        <Card className="grid grid-cols-2 divide-border sm:grid-cols-3 lg:grid-cols-5 lg:divide-x">
          {stats.map((s) => (
            <div key={s.label} className="flex items-start gap-3 p-5">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand">
                <s.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-[13px] text-muted">{s.label}</p>
                <p className="mt-0.5 text-2xl font-bold tracking-tight tabular-nums">{s.value}</p>
                <p className="truncate text-xs text-muted">{s.sub}</p>
              </div>
            </div>
          ))}
        </Card>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
          <Card>
            <CardHeader title="Recipients" description={failed ? `${failed} failed or bounced` : `${total} people`} />
            {recipients.length ? (
              <Table>
                <thead>
                  <tr>
                    <Th>Contact</Th>
                    <Th>Status</Th>
                    <Th className="text-center">Opened</Th>
                    <Th className="text-center">Clicked</Th>
                    <Th className="text-center">Replied</Th>
                    <Th className="text-right">Thread</Th>
                  </tr>
                </thead>
                <tbody>
                  {recipients.map((r) => (
                    <tr key={r.id} className="hover:bg-surface-2">
                      <Td>
                        <div className="flex items-center gap-3">
                          <Avatar name={r.client?.name ?? r.email} size={30} />
                          <div className="min-w-0">
                            {r.client ? (
                              <Link href={`/clients/${r.client.id}`} className="block truncate font-medium hover:text-brand">
                                {r.client.name}
                              </Link>
                            ) : (
                              <span className="block truncate font-medium">{r.email}</span>
                            )}
                            <span className="block truncate text-xs text-muted">{r.email}</span>
                          </div>
                        </div>
                      </Td>
                      <Td>
                        <Badge tone={statusTone(r.status)}>{r.status}</Badge>
                        {r.error && (
                          <p className="mt-1 max-w-56 truncate text-xs text-danger" title={r.error}>
                            {r.error}
                          </p>
                        )}
                        {r.sentAt && !r.error && <p className="mt-1 text-xs text-muted">{fmt(r.sentAt)}</p>}
                      </Td>
                      <Td className="text-center">
                        <Tick at={r.openedAt} label="Opened" />
                      </Td>
                      <Td className="text-center">
                        <Tick at={r.clickedAt} label="Clicked" />
                      </Td>
                      <Td className="text-center">
                        <Tick at={r.repliedAt} label="Replied" />
                      </Td>
                      <Td className="text-right">
                        {r.conversationId ? (
                          <Link href={`/inbox?c=${r.conversationId}`} className="text-[13px] font-medium text-brand hover:underline">
                            Open
                          </Link>
                        ) : (
                          <span className="text-muted/50">–</span>
                        )}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : (
              <EmptyState icon={<Send className="h-5 w-5" />} title="No recipients yet" description="Recipients appear here as soon as sending starts." />
            )}
          </Card>

          <Card className="self-start overflow-hidden">
            <CardHeader title="Email" description="Shown with sample data" />
            <div className="bg-[#eef0f3] p-3 dark:bg-[#0a0b0e]">
              <EmailPreview html={html} title="Sent email" />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
