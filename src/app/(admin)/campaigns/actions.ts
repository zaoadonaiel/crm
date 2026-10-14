"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { campaigns, CLIENT_STATUSES, type Audience, type EmailBlock, type EmailTheme } from "@/db/schema";
import { countAudience } from "@/lib/campaigns/audience";
import { sendCampaign, sendTestEmail } from "@/lib/campaigns/send";
import { CAMPAIGN_TEMPLATES, getTemplate } from "@/lib/campaigns/templates";
import { dispatchCampaignSend } from "@/lib/jobs/dispatch";
import { assertAdmin } from "@/lib/session";

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

const align = z.enum(["left", "center", "right"]);
const color = z.string().max(40).optional();
const url = z.string().max(2000);
const id = z.string().min(1).max(40);

const blockSchema = z.discriminatedUnion("type", [
  z.object({ id, type: z.literal("logo"), src: url, width: z.number().min(16).max(800), align, href: url.optional() }),
  z.object({ id, type: z.literal("heading"), text: z.string().max(500), level: z.union([z.literal(1), z.literal(2), z.literal(3)]), align, color }),
  z.object({ id, type: z.literal("text"), text: z.string().max(20000), align, color, size: z.number().min(10).max(32).optional() }),
  z.object({
    id,
    type: z.literal("image"),
    src: url,
    alt: z.string().max(300),
    width: z.number().min(16).max(800),
    href: url.optional(),
    align,
    rounded: z.boolean().optional(),
  }),
  z.object({ id, type: z.literal("button"), label: z.string().max(120), href: url, align, color, textColor: color }),
  z.object({ id, type: z.literal("divider"), color }),
  z.object({ id, type: z.literal("spacer"), height: z.number().min(0).max(400) }),
  z.object({
    id,
    type: z.literal("columns"),
    left: z.string().max(10000),
    right: z.string().max(10000),
    leftImage: url.optional(),
    rightImage: url.optional(),
  }),
  z.object({
    id,
    type: z.literal("social"),
    links: z.array(z.object({ network: z.string().max(30), url })).max(12),
    align,
  }),
  z.object({ id, type: z.literal("html"), html: z.string().max(50000) }),
]);

const themeSchema = z.object({
  brandColor: z.string().max(40).optional(),
  backgroundColor: z.string().max(40).optional(),
  contentBackground: z.string().max(40).optional(),
  textColor: z.string().max(40).optional(),
  fontFamily: z.string().max(200).optional(),
  width: z.number().min(400).max(800).optional(),
});

const audienceSchema = z.object({
  mode: z.enum(["all", "statuses", "tags", "clients", "segment"]),
  statuses: z.array(z.enum(CLIENT_STATUSES)).optional(),
  tags: z.array(z.string().max(100)).max(200).optional(),
  clientIds: z.array(z.string().max(40)).max(10000).optional(),
  segment: z.enum(["proposal_no_response", "invoice_unpaid", "no_contact_90d"]).optional(),
});

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    kind: z.enum(["newsletter", "announcement", "holiday", "outreach"]),
    subject: z.string().max(300),
    previewText: z.string().max(300),
    fromName: z.string().max(120).nullable(),
    blocks: z.array(blockSchema).max(200),
    theme: themeSchema,
    audience: audienceSchema,
    trackReplies: z.boolean(),
  })
  .partial();

export type CampaignPatch = z.infer<typeof patchSchema>;

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

function fail(err: unknown): { ok: false; error: string } {
  if (err instanceof z.ZodError) return { ok: false, error: err.issues[0]?.message ?? "Invalid data" };
  return { ok: false, error: err instanceof Error ? err.message : "Something went wrong" };
}

async function editable(campaignId: string) {
  const c = await db.query.campaigns.findFirst({ where: eq(campaigns.id, campaignId) });
  if (!c) throw new Error("Campaign not found");
  if (c.status !== "draft" && c.status !== "scheduled") throw new Error(`This campaign is already ${c.status} and can't be edited`);
  return c;
}

/* ------------------------------------------------------------------ */
/* CRUD                                                                */
/* ------------------------------------------------------------------ */

export async function createCampaign(templateId: string) {
  await assertAdmin();
  const t = getTemplate(templateId) ?? CAMPAIGN_TEMPLATES.find((x) => x.id === "blank")!;
  const [row] = await db
    .insert(campaigns)
    .values({
      name: t.id === "blank" ? "Untitled campaign" : `${t.name} — ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
      kind: t.kind,
      subject: t.subject,
      previewText: t.previewText,
      blocks: t.blocks(),
      theme: t.theme ?? {},
      audience: t.id === "reengage" ? { mode: "segment", segment: "proposal_no_response" } : { mode: "all" },
      trackReplies: t.trackReplies ?? true,
    })
    .returning({ id: campaigns.id });
  revalidatePath("/campaigns");
  redirect(`/campaigns/${row!.id}`);
}

export async function saveCampaign(campaignId: string, patch: CampaignPatch): Promise<Result<{ savedAt: string }>> {
  try {
    await assertAdmin();
    const data = patchSchema.parse(patch);
    await editable(campaignId);
    await db
      .update(campaigns)
      .set({
        ...data,
        blocks: data.blocks as EmailBlock[] | undefined,
        theme: data.theme as Partial<EmailTheme> | undefined,
        audience: data.audience as Audience | undefined,
        fromName: data.fromName === undefined ? undefined : data.fromName?.trim() || null,
      })
      .where(eq(campaigns.id, campaignId));
    return { ok: true, savedAt: new Date().toISOString() };
  } catch (err) {
    return fail(err);
  }
}

export async function duplicateCampaign(campaignId: string) {
  await assertAdmin();
  const c = await db.query.campaigns.findFirst({ where: eq(campaigns.id, campaignId) });
  if (!c) throw new Error("Campaign not found");
  const [row] = await db
    .insert(campaigns)
    .values({
      name: `${c.name} (copy)`,
      kind: c.kind,
      subject: c.subject,
      previewText: c.previewText,
      fromName: c.fromName,
      blocks: c.blocks,
      theme: c.theme,
      audience: c.audience,
      trackReplies: c.trackReplies,
    })
    .returning({ id: campaigns.id });
  revalidatePath("/campaigns");
  redirect(`/campaigns/${row!.id}`);
}

export async function deleteCampaign(campaignId: string): Promise<Result> {
  try {
    await assertAdmin();
    const deleted = await db
      .delete(campaigns)
      .where(and(eq(campaigns.id, campaignId), inArray(campaigns.status, ["draft", "scheduled", "failed"])))
      .returning({ id: campaigns.id });
    if (!deleted.length) throw new Error("Only drafts, scheduled or failed campaigns can be deleted");
    revalidatePath("/campaigns");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

/* ------------------------------------------------------------------ */
/* Audience + sending                                                  */
/* ------------------------------------------------------------------ */

export async function getAudienceCount(audience: Audience): Promise<Result<{ count: number }>> {
  try {
    await assertAdmin();
    const a = audienceSchema.parse(audience) as Audience;
    return { ok: true, count: await countAudience(a) };
  } catch (err) {
    return fail(err);
  }
}

export async function sendTest(campaignId: string, to: string): Promise<Result<{ to: string }>> {
  try {
    await assertAdmin();
    const emails = to
      .split(/[,;\s]+/)
      .map((e) => e.trim())
      .filter(Boolean)
      .slice(0, 5);
    if (!emails.length) throw new Error("Enter an email address");
    for (const e of emails) await sendTestEmail(campaignId, e);
    return { ok: true, to: emails.join(", ") };
  } catch (err) {
    return fail(err);
  }
}

async function assertReady(campaignId: string) {
  const c = await editable(campaignId);
  if (!c.subject.trim()) throw new Error("Add a subject line before sending");
  if (!c.blocks.length) throw new Error("The email has no content");
  const n = await countAudience(c.audience);
  if (n === 0) throw new Error("Nobody matches this audience");
  return c;
}

export async function sendNow(campaignId: string): Promise<Result> {
  try {
    await assertAdmin();
    await assertReady(campaignId);
    // Queue as "due now" first: if the background worker dies, the scheduler picks it up.
    await db
      .update(campaigns)
      .set({ status: "scheduled", scheduledAt: new Date() })
      .where(and(eq(campaigns.id, campaignId), inArray(campaigns.status, ["draft", "scheduled"])));

    let dispatched = false;
    try {
      dispatched = await dispatchCampaignSend(campaignId);
    } catch (err) {
      console.error("[campaigns] Trigger.dev dispatch failed, sending inline", err);
    }
    if (!dispatched) {
      after(async () => {
        await sendCampaign(campaignId);
      });
    }
    revalidatePath("/campaigns");
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function scheduleCampaign(campaignId: string, isoDate: string): Promise<Result<{ scheduledAt: string }>> {
  try {
    await assertAdmin();
    const when = new Date(isoDate);
    if (Number.isNaN(when.getTime())) throw new Error("Pick a valid date and time");
    if (when.getTime() < Date.now() + 60_000) throw new Error("Pick a time at least a minute in the future");
    await assertReady(campaignId);
    await db.update(campaigns).set({ status: "scheduled", scheduledAt: when }).where(eq(campaigns.id, campaignId));
    revalidatePath("/campaigns");
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true, scheduledAt: when.toISOString() };
  } catch (err) {
    return fail(err);
  }
}

export async function unscheduleCampaign(campaignId: string): Promise<Result> {
  try {
    await assertAdmin();
    const rows = await db
      .update(campaigns)
      .set({ status: "draft", scheduledAt: null })
      .where(and(eq(campaigns.id, campaignId), eq(campaigns.status, "scheduled")))
      .returning({ id: campaigns.id });
    if (!rows.length) throw new Error("This campaign is no longer scheduled");
    revalidatePath("/campaigns");
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}
