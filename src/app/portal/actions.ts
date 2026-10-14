"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireClient } from "@/lib/session";
import { recordPortalMessage } from "@/lib/conversations";
import { getStripe } from "@/lib/stripe";
import { appUrl } from "@/lib/utils";

export type PortalActionState = { error?: string; message?: string; sentAt?: number } | null;

export async function sendPortalMessageAction(_prev: PortalActionState, fd: FormData): Promise<PortalActionState> {
  const { client } = await requireClient();
  if (!client) return { error: "Your account isn't linked to a client profile yet." };
  const text = String(fd.get("body") ?? "").trim();
  if (!text) return { error: "Write a message first." };
  if (text.length > 5000) return { error: "That message is a little long — please keep it under 5,000 characters." };
  try {
    await recordPortalMessage(client.id, text);
  } catch (err) {
    console.error("[portal] message failed", err);
    return { error: "We couldn't send your message. Please try again." };
  }
  revalidatePath("/portal/messages");
  revalidatePath("/portal");
  return { message: "Sent", sentAt: Date.now() };
}

/** Opens Stripe's Billing Portal so the client can manage saved cards. */
export async function openBillingPortalAction() {
  const { client } = await requireClient();
  const stripe = getStripe();
  if (!client?.stripeCustomerId || !stripe) redirect("/portal/invoices?billing=unavailable");
  let url: string;
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: client.stripeCustomerId,
      return_url: appUrl("/portal/invoices"),
    });
    url = session.url;
  } catch (err) {
    console.error("[portal] billing portal failed", err);
    redirect("/portal/invoices?billing=error");
  }
  redirect(url);
}
