"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { clients, proposals } from "@/db/schema";
import { assertAdmin } from "@/lib/session";
import { logActivity } from "@/lib/conversations";
import { enrollForTrigger, stopEnrollmentsForRef } from "@/lib/automations/enroll";
import { sendEmail } from "@/lib/email/send";
import { noticeEmailHtml } from "@/lib/email/transactional";
import { appUrl, firstName, money } from "@/lib/utils";
import { parseMoneyToCents } from "@/lib/billing/format";

export type ProposalActionState = { error?: string; message?: string } | null;

export async function createProposalAction(_prev: ProposalActionState, fd: FormData): Promise<ProposalActionState> {
  await assertAdmin();
  const clientId = String(fd.get("clientId") ?? "");
  const title = String(fd.get("title") ?? "").trim();
  const client = clientId ? await db.query.clients.findFirst({ where: eq(clients.id, clientId), columns: { id: true, name: true, company: true } }) : null;
  if (!client) return { error: "Choose a client" };
  const [p] = await db
    .insert(proposals)
    .values({ clientId, title: title || `Proposal for ${client.company || client.name}` })
    .returning({ id: proposals.id });
  revalidatePath("/proposals");
  redirect(`/proposals/${p!.id}`);
}

const saveSchema = z.object({
  title: z.string().trim().min(1, "Give the proposal a title").max(200),
  clientId: z.string().min(1, "Choose a client"),
  amount: z.number({ message: "Enter a valid amount" }).int().min(0, "Enter a valid amount"),
  body: z.string().max(100_000),
  autoFollowUp: z.boolean(),
});

async function sendProposal(id: string) {
  const p = await db.query.proposals.findFirst({ where: eq(proposals.id, id), with: { client: true } });
  if (!p) throw new Error("Proposal not found");
  if (p.status === "accepted" || p.status === "declined") throw new Error(`This proposal was already ${p.status}.`);
  const url = appUrl(`/p/${p.token}`);
  const amount = money(p.amount, p.currency);
  const resend = p.status !== "draft";

  await sendEmail({
    to: p.client.email,
    subject: resend ? `Reminder: ${p.title}` : `Proposal: ${p.title}`,
    html: await noticeEmailHtml({
      heading: p.title,
      bodyText: [
        `Hi ${firstName(p.client.name) || "there"},`,
        resend
          ? `Just resending the proposal I put together for you${p.amount ? ` (${amount})` : ""} in case it got buried.`
          : `I've put together a proposal for you${p.amount ? ` — the total comes to ${amount}` : ""}.`,
        "You can read through everything and accept it online in a couple of clicks. If you have any questions, just reply to this email.",
      ].join("\n\n"),
      cta: { label: "Review proposal", url },
      footnote: "This link is unique to you — please don't forward it.",
    }),
    tags: { proposal_id: p.id },
  });

  const now = new Date();
  await db
    .update(proposals)
    .set({ status: p.status === "viewed" ? "viewed" : "sent", sentAt: now })
    .where(eq(proposals.id, p.id));
  await db
    .update(clients)
    .set({ lastContactedAt: now, ...(p.client.status === "lead" ? { status: "prospect" as const } : {}) })
    .where(eq(clients.id, p.clientId));
  await logActivity(p.clientId, "proposal.sent", `${resend ? "Resent" : "Sent"} proposal “${p.title}” (${amount})`, { proposalId: p.id });
  if (p.client.status === "lead") await logActivity(p.clientId, "client.status", "Status changed from lead to prospect");
  if (p.autoFollowUp) await enrollForTrigger("proposal_sent", p.clientId, { type: "proposal", id: p.id });
}

/** Save the editor; when intent=send also emails the client. */
export async function saveProposalAction(id: string, _prev: ProposalActionState, fd: FormData): Promise<ProposalActionState> {
  await assertAdmin();
  const amount = parseMoneyToCents(fd.get("amount"));
  const parsed = saveSchema.safeParse({
    title: fd.get("title") ?? "",
    clientId: fd.get("clientId") ?? "",
    amount: Number.isNaN(amount) ? -1 : amount,
    body: String(fd.get("body") ?? ""),
    autoFollowUp: fd.get("autoFollowUp") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const existing = await db.query.proposals.findFirst({ where: eq(proposals.id, id) });
  if (!existing) return { error: "Proposal not found" };
  const locked = existing.status === "accepted" || existing.status === "declined";
  if (locked && (parsed.data.amount !== existing.amount || parsed.data.clientId !== existing.clientId)) {
    return { error: `This proposal was ${existing.status}; amount and client can't be changed.` };
  }
  const client = await db.query.clients.findFirst({ where: eq(clients.id, parsed.data.clientId), columns: { id: true } });
  if (!client) return { error: "Client not found" };

  await db.update(proposals).set(parsed.data).where(eq(proposals.id, id));
  if (!parsed.data.autoFollowUp && existing.autoFollowUp) await stopEnrollmentsForRef(id, "follow-up disabled");

  if (fd.get("intent") === "send") {
    try {
      await sendProposal(id);
    } catch (err) {
      revalidatePath(`/proposals/${id}`);
      return { error: err instanceof Error ? err.message : "Could not send the proposal" };
    }
    revalidatePath(`/proposals/${id}`);
    revalidatePath("/proposals");
    return { message: existing.status === "draft" ? "Proposal sent" : "Proposal resent" };
  }
  revalidatePath(`/proposals/${id}`);
  revalidatePath("/proposals");
  return { message: "Saved" };
}

export async function deleteProposalAction(id: string) {
  await assertAdmin();
  await stopEnrollmentsForRef(id, "proposal deleted");
  await db.delete(proposals).where(eq(proposals.id, id));
  revalidatePath("/proposals");
  redirect("/proposals");
}

export async function duplicateProposalAction(id: string) {
  await assertAdmin();
  const p = await db.query.proposals.findFirst({ where: eq(proposals.id, id) });
  if (!p) throw new Error("Proposal not found");
  const [copy] = await db
    .insert(proposals)
    .values({ clientId: p.clientId, title: `${p.title} (copy)`, amount: p.amount, currency: p.currency, body: p.body, autoFollowUp: p.autoFollowUp })
    .returning({ id: proposals.id });
  redirect(`/proposals/${copy!.id}`);
}

/** Manually mark accepted/declined (e.g. the client said yes on a call). */
export async function markProposalAction(id: string, status: "accepted" | "declined") {
  await assertAdmin();
  const p = await db.query.proposals.findFirst({ where: eq(proposals.id, id) });
  if (!p) throw new Error("Proposal not found");
  await db.update(proposals).set({ status, respondedAt: new Date() }).where(eq(proposals.id, id));
  await stopEnrollmentsForRef(id, status);
  if (status === "accepted") await db.update(clients).set({ status: "active" }).where(eq(clients.id, p.clientId));
  await logActivity(p.clientId, `proposal.${status}`, `Proposal “${p.title}” marked ${status}`, { proposalId: id });
  revalidatePath(`/proposals/${id}`);
  revalidatePath("/proposals");
}
