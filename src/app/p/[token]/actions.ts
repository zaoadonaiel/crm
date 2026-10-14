"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { clients, proposals } from "@/db/schema";
import { logActivity, recordPortalMessage } from "@/lib/conversations";
import { stopEnrollmentsForRef } from "@/lib/automations/enroll";
import { sendEmail } from "@/lib/email/send";
import { noticeEmailHtml } from "@/lib/email/transactional";
import { getSettings } from "@/lib/settings";
import { appUrl, money } from "@/lib/utils";

export type RespondState = { error?: string; done?: "accepted" | "declined" } | null;

async function respond(token: string, decision: "accepted" | "declined", fd: FormData): Promise<RespondState> {
  if (typeof token !== "string" || token.length < 10) return { error: "Invalid link" };
  const note = String(fd.get("note") ?? "")
    .trim()
    .slice(0, 5000);
  const signer = String(fd.get("signer") ?? "")
    .trim()
    .slice(0, 200);
  if (decision === "accepted" && !signer) return { error: "Please type your full name to accept." };

  const p = await db.query.proposals.findFirst({ where: eq(proposals.token, token), with: { client: true } });
  if (!p) return { error: "This proposal is no longer available." };
  if (p.status === "accepted" || p.status === "declined") return { done: p.status };
  if (p.status === "draft") return { error: "This proposal hasn't been sent yet." };

  // Conditional update guards against double-submits.
  const updated = await db
    .update(proposals)
    .set({ status: decision, respondedAt: new Date() })
    .where(and(eq(proposals.id, p.id), inArray(proposals.status, ["sent", "viewed"])))
    .returning({ id: proposals.id });
  if (!updated.length) return { done: decision };

  await stopEnrollmentsForRef(p.id, decision);
  if (decision === "accepted") await db.update(clients).set({ status: "active" }).where(eq(clients.id, p.clientId));

  const amount = money(p.amount, p.currency);
  await logActivity(
    p.clientId,
    `proposal.${decision}`,
    decision === "accepted" ? `Accepted proposal “${p.title}” (${amount})${signer ? ` — signed by ${signer}` : ""}` : `Declined proposal “${p.title}”`,
    { proposalId: p.id, signer: signer || undefined },
  );
  if (note) {
    await recordPortalMessage(p.clientId, `${decision === "accepted" ? "Accepted" : "Declined"} proposal “${p.title}”:\n\n${note}`);
  }

  try {
    const s = await getSettings();
    const who = p.client.company ? `${p.client.name} (${p.client.company})` : p.client.name;
    await sendEmail({
      to: s.fromEmail,
      subject: decision === "accepted" ? `${who} accepted “${p.title}”` : `${who} declined “${p.title}”`,
      html: await noticeEmailHtml({
        heading: decision === "accepted" ? "Proposal accepted" : "Proposal declined",
        bodyText: [
          `${who} ${decision} your proposal “${p.title}” (${amount}).`,
          signer ? `Signed by: ${signer}` : "",
          note ? `Their note:\n${note}` : "",
          decision === "accepted" ? "Next step: send the first invoice from their client page." : "",
        ]
          .filter(Boolean)
          .join("\n\n"),
        cta: { label: "Open client", url: appUrl(`/clients/${p.clientId}`) },
      }),
    });
  } catch (err) {
    console.error("[proposal] admin notification failed", err);
  }

  revalidatePath(`/p/${token}`);
  return { done: decision };
}

export async function acceptProposalAction(token: string, _prev: RespondState, fd: FormData) {
  return respond(token, "accepted", fd);
}

export async function declineProposalAction(token: string, _prev: RespondState, fd: FormData) {
  return respond(token, "declined", fd);
}
