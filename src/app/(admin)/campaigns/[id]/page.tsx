import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { campaignRecipients, campaigns, clients } from "@/db/schema";
import { countAudience } from "@/lib/campaigns/audience";
import { requireAdmin } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { CampaignBuilder } from "@/components/campaigns/campaign-builder";
import { CampaignReport } from "@/components/campaigns/campaign-report";
import type { BuilderSettings } from "@/components/campaigns/types";

export const metadata: Metadata = { title: "Campaign" };

/** Sent/sending campaigns — and ones queued by "Send now" (scheduled for now) — show the report. */
function showReport(c: { status: string; scheduledAt: Date | null }) {
  if (c.status === "sending" || c.status === "sent" || c.status === "failed") return true;
  return c.status === "scheduled" && !!c.scheduledAt && c.scheduledAt.getTime() <= Date.now() + 5_000;
}

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  const { id } = await params;
  const [campaign, s] = await Promise.all([db.query.campaigns.findFirst({ where: eq(campaigns.id, id) }), getSettings()]);
  if (!campaign) notFound();

  const renderSettings = { businessName: s.businessName, logoUrl: s.logoUrl, brandColor: s.brandColor, address: s.address };

  if (showReport(campaign)) {
    const recipients = await db.query.campaignRecipients.findMany({
      where: eq(campaignRecipients.campaignId, campaign.id),
      with: { client: { columns: { id: true, name: true, company: true } } },
      orderBy: [desc(campaignRecipients.repliedAt), desc(campaignRecipients.clickedAt), desc(campaignRecipients.openedAt), asc(campaignRecipients.email)],
    });
    return <CampaignReport campaign={campaign} recipients={recipients} settings={renderSettings} />;
  }

  const [clientRows, tagRows, count] = await Promise.all([
    db
      .select({ id: clients.id, name: clients.name, email: clients.email, company: clients.company, status: clients.status })
      .from(clients)
      .orderBy(asc(clients.name))
      .limit(5000),
    db.selectDistinct({ tag: sql<string>`jsonb_array_elements_text(${clients.tags})` }).from(clients),
    countAudience(campaign.audience),
  ]);
  const tags = tagRows
    .map((r) => r.tag)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));

  const settings: BuilderSettings = { ...renderSettings, fromName: s.fromName, fromEmail: s.fromEmail };

  return (
    <CampaignBuilder
      key={`${campaign.status}-${campaign.scheduledAt?.toISOString() ?? ""}`}
      initial={{
        id: campaign.id,
        name: campaign.name,
        kind: campaign.kind,
        subject: campaign.subject,
        previewText: campaign.previewText,
        fromName: campaign.fromName,
        blocks: campaign.blocks,
        theme: campaign.theme,
        audience: campaign.audience,
        trackReplies: campaign.trackReplies,
        status: campaign.status,
        scheduledAt: campaign.scheduledAt?.toISOString() ?? null,
      }}
      settings={settings}
      clients={clientRows}
      tags={tags}
      initialCount={count}
      adminEmail={session.user.email}
    />
  );
}
