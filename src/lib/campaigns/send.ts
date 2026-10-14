/**
 * Campaign delivery. Deliberately free of `server-only` / Next.js imports so it
 * can run inside Trigger.dev tasks and cron handlers as well as server actions.
 */
import { and, eq, inArray, lt, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { campaignRecipients, campaigns, clients, conversations, messages } from "@/db/schema";
import { createConversation, logActivity } from "@/lib/conversations";
import { inboundReplyAddress, sendEmail } from "@/lib/email/send";
import { renderCampaign, type CampaignRenderSettings, type MergeVars } from "@/lib/email/render-campaign";
import { getSettings, type AppSettings } from "@/lib/settings";
import { firstName, mergeTags } from "@/lib/utils";
import { resolveAudience } from "./audience";
import { unsubscribeLinks } from "./unsubscribe";

type Campaign = typeof campaigns.$inferSelect;
type Recipient = typeof campaignRecipients.$inferSelect;

export type SendCampaignResult =
  | { ok: true; campaignId: string; total: number; sent: number; failed: number }
  | { ok: false; campaignId: string; reason: string };

const CONCURRENCY = Math.max(1, Number(process.env.CAMPAIGN_SEND_CONCURRENCY) || 10);
/** A campaign stuck in "sending" this long (worker died) gets resumed by the scheduler. */
const STALE_SENDING_MS = 15 * 60 * 1000;

function renderSettings(s: AppSettings): CampaignRenderSettings {
  return { businessName: s.businessName, logoUrl: s.logoUrl, brandColor: s.brandColor, address: s.address };
}

function fromHeader(campaign: Pick<Campaign, "fromName">, s: AppSettings) {
  const name = (campaign.fromName || s.fromName || s.businessName).replace(/[<>"\r\n]/g, "").trim();
  return `"${name}" <${s.fromEmail}>`;
}

function varsFor(r: { name: string; email: string; company: string | null }): MergeVars {
  return { first_name: firstName(r.name), name: r.name, company: r.company, email: r.email };
}

function preview(text: string) {
  return text.replace(/\s+/g, " ").trim().slice(0, 140);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Retry provider rate limits (HTTP 429) and transient 5xx with backoff. */
async function sendWithRetry(email: Parameters<typeof sendEmail>[0]) {
  let attempt = 0;
  for (;;) {
    try {
      return await sendEmail(email);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const retryable = /\((429|5\d\d)\)/.test(msg);
      if (!retryable || attempt >= 4) throw err;
      await sleep(600 * 2 ** attempt + Math.random() * 300);
      attempt++;
    }
  }
}

/** Run `fn` over items with at most `limit` in flight. */
async function pool<T>(items: T[], limit: number, fn: (item: T, index: number) => Promise<void>, onBatch?: () => Promise<void>) {
  let next = 0;
  let done = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      await fn(items[i]!, i);
      done++;
      if (onBatch && done % (limit * 5) === 0) await onBatch();
    }
  });
  await Promise.all(workers);
}

/** Build the personalised message for one recipient. */
async function buildMessage(campaign: Campaign, s: AppSettings, r: { name: string; email: string; company: string | null }) {
  const vars = varsFor(r);
  const links = await unsubscribeLinks(r.email);
  const { html, text } = renderCampaign({
    blocks: campaign.blocks,
    theme: campaign.theme,
    subject: campaign.subject,
    previewText: campaign.previewText,
    vars,
    unsubscribeUrl: links.pageUrl,
    settings: renderSettings(s),
  });
  const subject = mergeTags(campaign.subject, vars).replace(/[\r\n]+/g, " ").trim() || "(no subject)";
  const mailto = process.env.UNSUBSCRIBE_MAILTO;
  const headers: Record<string, string> = {
    "List-Unsubscribe": `<${links.oneClickUrl}>${mailto ? `, <mailto:${mailto}?subject=unsubscribe>` : ""}`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
  return { html, text, subject, headers };
}

async function deliverOne(campaign: Campaign, s: AppSettings, recipient: Recipient, client: { name: string; company: string | null } | undefined) {
  const person = { name: client?.name ?? recipient.email.split("@")[0]!, email: recipient.email, company: client?.company ?? null };
  try {
    const msg = await buildMessage(campaign, s, person);

    let conversationId = recipient.conversationId;
    if (campaign.trackReplies && recipient.clientId && !conversationId) {
      conversationId = (await createConversation(recipient.clientId, msg.subject, campaign.id)).id;
      await db.update(campaignRecipients).set({ conversationId }).where(eq(campaignRecipients.id, recipient.id));
    }

    const result = await sendWithRetry({
      to: recipient.email,
      from: fromHeader(campaign, s),
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
      replyTo: conversationId ? inboundReplyAddress(conversationId) : undefined,
      headers: msg.headers,
      tags: {
        campaign_id: campaign.id,
        recipient_id: recipient.id,
        ...(conversationId ? { conversation_id: conversationId } : {}),
      },
    });

    const now = new Date();
    await db
      .update(campaignRecipients)
      .set({ status: "sent", providerId: result.id, sentAt: now, error: null })
      .where(eq(campaignRecipients.id, recipient.id));

    if (conversationId) {
      await db.insert(messages).values({
        conversationId,
        direction: "out",
        channel: "email",
        fromEmail: s.fromEmail,
        toEmail: recipient.email,
        subject: msg.subject,
        // Store the readable body only; the footer (address + unsubscribe link) is noise in the inbox/portal.
        bodyText: msg.text.split(/\n--\n/)[0]!.trim(),
        bodyHtml: msg.html,
        providerId: result.id,
      });
      await db
        .update(conversations)
        .set({
          lastMessageAt: now,
          lastMessagePreview: preview(msg.text),
          lastMessageDirection: "out",
        })
        .where(eq(conversations.id, conversationId));
    }
    if (recipient.clientId) {
      await db.update(clients).set({ lastContactedAt: now }).where(eq(clients.id, recipient.clientId));
    }
    return true;
  } catch (err) {
    const message = (err instanceof Error ? err.message : String(err)).slice(0, 500);
    await db
      .update(campaignRecipients)
      .set({ status: "failed", error: message })
      .where(eq(campaignRecipients.id, recipient.id))
      .catch(() => {});
    return false;
  }
}

/**
 * Atomically moves a campaign into "sending". Accepts draft/scheduled
 * campaigns, or (with `resumeStale`) a campaign whose sender died mid-way.
 */
async function claim(campaignId: string, resumeStale = false) {
  const statusOk = resumeStale
    ? and(eq(campaigns.status, "sending"), lt(campaigns.updatedAt, new Date(Date.now() - STALE_SENDING_MS)))
    : inArray(campaigns.status, ["draft", "scheduled"]);
  const [row] = await db
    .update(campaigns)
    .set({ status: "sending", updatedAt: new Date() })
    .where(and(eq(campaigns.id, campaignId), statusOk))
    .returning();
  return row;
}

/** Create recipient rows once (idempotent on resume). */
async function ensureRecipients(campaign: Campaign) {
  const existing = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(campaignRecipients)
    .where(eq(campaignRecipients.campaignId, campaign.id));
  if (Number(existing[0]?.n ?? 0) > 0) return;

  const audience = await resolveAudience(campaign.audience);
  for (let i = 0; i < audience.length; i += 200) {
    const chunk = audience.slice(i, i + 200);
    await db.insert(campaignRecipients).values(
      chunk.map((m) => ({ campaignId: campaign.id, clientId: m.clientId, email: m.email, status: "queued" as const })),
    );
  }
}

async function deliver(campaign: Campaign): Promise<SendCampaignResult> {
  try {
    const s = await getSettings();
    await ensureRecipients(campaign);

    const queued = await db.query.campaignRecipients.findMany({
      where: and(eq(campaignRecipients.campaignId, campaign.id), eq(campaignRecipients.status, "queued")),
      with: { client: { columns: { name: true, company: true } } },
    });

    let sent = 0;
    let failed = 0;
    await pool(
      queued,
      CONCURRENCY,
      async (r) => {
        if (await deliverOne(campaign, s, r, r.client ?? undefined)) sent++;
        else failed++;
      },
      // Heartbeat so the scheduler doesn't consider us stale.
      async () => {
        await db.update(campaigns).set({ updatedAt: new Date() }).where(eq(campaigns.id, campaign.id));
      },
    );

    const [totals] = await db
      .select({
        total: sql<number>`count(*)::int`,
        ok: sql<number>`count(*) filter (where ${campaignRecipients.status} not in ('failed','queued','skipped'))::int`,
      })
      .from(campaignRecipients)
      .where(eq(campaignRecipients.campaignId, campaign.id));
    const total = Number(totals?.total ?? 0);
    const okCount = Number(totals?.ok ?? 0);

    const finalStatus = total > 0 && okCount === 0 ? "failed" : "sent";
    await db.update(campaigns).set({ status: finalStatus, sentAt: new Date() }).where(eq(campaigns.id, campaign.id));
    await logActivity(null, "campaign.sent", `Campaign “${campaign.name}” sent to ${okCount} of ${total} recipients`, {
      campaignId: campaign.id,
      sent: okCount,
      failed: total - okCount,
    });
    return { ok: true, campaignId: campaign.id, total, sent, failed };
  } catch (err) {
    console.error(`[campaigns] send failed for ${campaign.id}`, err);
    await db
      .update(campaigns)
      .set({ status: "failed" })
      .where(eq(campaigns.id, campaign.id))
      .catch(() => {});
    return { ok: false, campaignId: campaign.id, reason: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Send a draft or scheduled campaign to its audience. Safe to call more than
 * once — only the first caller claims the campaign.
 */
export async function sendCampaign(campaignId: string): Promise<SendCampaignResult> {
  const campaign = await claim(campaignId);
  if (!campaign) {
    const existing = await db.query.campaigns.findFirst({ where: eq(campaigns.id, campaignId), columns: { status: true } });
    return { ok: false, campaignId, reason: existing ? `Campaign is already ${existing.status}` : "Campaign not found" };
  }
  return deliver(campaign);
}

/** Send a single preview of the campaign (subject prefixed with [Test]). */
export async function sendTestEmail(campaignId: string, to: string) {
  const email = to.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email address");
  const campaign = await db.query.campaigns.findFirst({ where: eq(campaigns.id, campaignId) });
  if (!campaign) throw new Error("Campaign not found");
  const s = await getSettings();
  const client = await db.query.clients.findFirst({ where: eq(sql`lower(${clients.email})`, email) });
  const person = client
    ? { name: client.name, email, company: client.company }
    : { name: "Alex Sample", email, company: "Sample Co" };
  const msg = await buildMessage(campaign, s, person);
  return sendWithRetry({
    to: email,
    from: fromHeader(campaign, s),
    subject: `[Test] ${msg.subject}`,
    html: msg.html,
    text: msg.text,
    headers: msg.headers,
    tags: { campaign_id: campaign.id, test: "true" },
  });
}

/**
 * Sends every campaign whose schedule is due, and resumes campaigns whose
 * sender died mid-way. Called by the cron / Trigger.dev scheduler.
 */
export async function processScheduledCampaigns() {
  const due = await db.query.campaigns.findMany({
    where: and(eq(campaigns.status, "scheduled"), lte(campaigns.scheduledAt, new Date())),
    columns: { id: true },
  });
  const stale = await db.query.campaigns.findMany({
    where: and(eq(campaigns.status, "sending"), lt(campaigns.updatedAt, new Date(Date.now() - STALE_SENDING_MS))),
    columns: { id: true },
  });

  const results: SendCampaignResult[] = [];
  for (const c of due) results.push(await sendCampaign(c.id));
  for (const c of stale) {
    const claimed = await claim(c.id, true);
    if (claimed) results.push(await deliver(claimed));
  }
  return { processed: results.length, results };
}
