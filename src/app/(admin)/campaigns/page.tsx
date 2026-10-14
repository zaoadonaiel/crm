import type { Metadata } from "next";
import Link from "next/link";
import { desc, sql } from "drizzle-orm";
import { CalendarClock, Eye, Megaphone, MessageSquareReply, MousePointerClick, Send } from "lucide-react";
import { db } from "@/db";
import { campaignRecipients, campaigns } from "@/db/schema";
import { Badge, Card, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui";
import { CampaignRowActions, NewCampaignButton } from "@/components/campaigns/list-actions";
import { describeAudience } from "@/lib/campaigns/audience-meta";
import { CAMPAIGN_KINDS } from "@/lib/campaigns/templates";
import { requireAdmin } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { statusTone } from "@/lib/status";

export const metadata: Metadata = { title: "Campaigns" };

type Stats = { total: number; delivered: number; opened: number; clicked: number; replied: number };

function pct(n: number, d: number) {
  return d ? `${Math.round((n / d) * 100)}%` : "—";
}

function fmtDate(d: Date) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
}

export default async function CampaignsPage() {
  await requireAdmin();
  const r = campaignRecipients;
  const [rows, statRows, s] = await Promise.all([
    db.query.campaigns.findMany({ orderBy: [desc(campaigns.updatedAt)] }),
    db
      .select({
        campaignId: r.campaignId,
        total: sql<number>`count(*)::int`,
        delivered: sql<number>`count(*) filter (where ${r.status} not in ('queued','failed','skipped','bounced'))::int`,
        opened: sql<number>`count(*) filter (where ${r.openedAt} is not null or ${r.status} in ('opened','clicked'))::int`,
        clicked: sql<number>`count(*) filter (where ${r.clickedAt} is not null or ${r.status} = 'clicked')::int`,
        replied: sql<number>`count(${r.repliedAt})::int`,
      })
      .from(r)
      .groupBy(r.campaignId),
    getSettings(),
  ]);

  const stats = new Map<string, Stats>(statRows.map((x) => [x.campaignId, { ...x }]));
  const totals = statRows.reduce(
    (a, x) => ({
      delivered: a.delivered + Number(x.delivered),
      opened: a.opened + Number(x.opened),
      clicked: a.clicked + Number(x.clicked),
      replied: a.replied + Number(x.replied),
    }),
    { delivered: 0, opened: 0, clicked: 0, replied: 0 },
  );
  const renderSettings = { businessName: s.businessName, logoUrl: s.logoUrl, brandColor: s.brandColor, address: s.address };
  const kindLabel = Object.fromEntries(CAMPAIGN_KINDS.map((k) => [k.value, k.label]));

  const summary = [
    { label: "Emails sent", value: totals.delivered.toLocaleString(), icon: Send },
    { label: "Avg. open rate", value: pct(totals.opened, totals.delivered), icon: Eye },
    { label: "Avg. click rate", value: pct(totals.clicked, totals.delivered), icon: MousePointerClick },
    { label: "Replies", value: totals.replied.toLocaleString(), icon: MessageSquareReply },
  ];

  return (
    <div>
      <PageHeader
        title="Campaigns"
        description="Newsletters, announcements and re-engagement emails."
        icon={<Megaphone className="h-5 w-5" />}
        actions={<NewCampaignButton settings={renderSettings} />}
      />

      <div className="space-y-6 p-4 sm:p-6">
        {!s.address && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
            <span>Add your business mailing address in Settings — it&apos;s legally required in every marketing email footer.</span>
            <Link href="/settings" className="font-semibold underline">
              Open settings
            </Link>
          </div>
        )}

        <Card className="grid grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-border">
          {summary.map((x) => (
            <div key={x.label} className="flex items-start gap-3 p-5">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand">
                <x.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[13px] text-muted">{x.label}</p>
                <p className="mt-0.5 text-2xl font-bold tracking-tight tabular-nums">{x.value}</p>
              </div>
            </div>
          ))}
        </Card>

        <Card>
          {rows.length ? (
            <Table>
              <thead>
                <tr>
                  <Th>Campaign</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Recipients</Th>
                  <Th className="text-right">Opened</Th>
                  <Th className="text-right">Clicked</Th>
                  <Th className="text-right">Replied</Th>
                  <Th>Date</Th>
                  <Th className="w-10">
                    <span className="sr-only">Actions</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => {
                  const st = stats.get(c.id);
                  const hasStats = !!st && st.total > 0;
                  const date =
                    c.status === "scheduled" && c.scheduledAt ? (
                      <span className="inline-flex items-center gap-1 text-purple-700">
                        <CalendarClock className="h-3.5 w-3.5" />
                        {c.scheduledAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                      </span>
                    ) : (
                      fmtDate(c.sentAt ?? c.updatedAt)
                    );
                  return (
                    <tr key={c.id} className="group hover:bg-surface-2">
                      <Td className="max-w-[340px]">
                        <Link href={`/campaigns/${c.id}`} className="block truncate font-medium group-hover:text-brand">
                          {c.name}
                        </Link>
                        <span className="block truncate text-xs text-muted">
                          {kindLabel[c.kind] ?? c.kind} · {c.subject || "No subject"} · {describeAudience(c.audience)}
                        </span>
                      </Td>
                      <Td>
                        <Badge tone={statusTone(c.status)}>{c.status}</Badge>
                      </Td>
                      <Td className="text-right tabular-nums">{hasStats ? st.total : "—"}</Td>
                      <Td className="text-right tabular-nums">{hasStats ? pct(st.opened, st.delivered) : "—"}</Td>
                      <Td className="text-right tabular-nums">{hasStats ? pct(st.clicked, st.delivered) : "—"}</Td>
                      <Td className="text-right tabular-nums">{hasStats ? st.replied : "—"}</Td>
                      <Td className="whitespace-nowrap text-[13px] text-muted">{date}</Td>
                      <Td>
                        <CampaignRowActions id={c.id} name={c.name} deletable={["draft", "scheduled", "failed"].includes(c.status)} />
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          ) : (
            <EmptyState
              icon={<Megaphone className="h-5 w-5" />}
              title="No campaigns yet"
              description="Send a newsletter, announce something you built, or check in with people who went quiet."
              action={<NewCampaignButton settings={renderSettings} label="Create your first campaign" />}
            />
          )}
        </Card>
      </div>
    </div>
  );
}
