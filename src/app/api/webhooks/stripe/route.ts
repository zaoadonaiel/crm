import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { clients } from "@/db/schema";
import { getStripe } from "@/lib/stripe";
import { handleInvoicePaid, upsertInvoiceFromStripe } from "@/lib/billing/stripe-sync";
import { logActivity } from "@/lib/conversations";
import { stopEnrollmentsForRef } from "@/lib/automations/enroll";

/**
 * POST /api/webhooks/stripe
 * Configure in Stripe → Developers → Webhooks with the invoice.* events below
 * and customer.deleted; put the signing secret in STRIPE_WEBHOOK_SECRET.
 */
export async function POST(req: Request) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) return Response.json({ error: "Stripe is not configured" }, { status: 503 });

  const sig = req.headers.get("stripe-signature");
  if (!sig) return Response.json({ error: "Missing signature" }, { status: 400 });

  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, secret, undefined, Stripe.createSubtleCryptoProvider());
  } catch (err) {
    console.error("[stripe:webhook] signature verification failed", err);
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "invoice.created":
      case "invoice.finalized":
      case "invoice.updated":
      case "invoice.paid":
      case "invoice.payment_succeeded":
      case "invoice.voided":
      case "invoice.marked_uncollectible": {
        const res = await upsertInvoiceFromStripe(event.data.object);
        if (!res) break; // not one of our clients' invoices
        await handleInvoicePaid(res.row, res.previousStatus);
        if (res.row.status === "void" || res.row.status === "uncollectible") {
          await stopEnrollmentsForRef(res.row.id, res.row.status);
        }
        if (event.type === "invoice.marked_uncollectible" && res.previousStatus !== "uncollectible") {
          await logActivity(res.row.clientId, "invoice.uncollectible", `Invoice ${res.row.number ?? ""} marked uncollectible`.trim(), {
            invoiceId: res.row.id,
          });
        }
        break;
      }
      case "customer.deleted": {
        await db.update(clients).set({ stripeCustomerId: null }).where(eq(clients.stripeCustomerId, event.data.object.id));
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error(`[stripe:webhook] failed handling ${event.type}`, err);
    // 500 → Stripe retries with backoff
    return Response.json({ error: "Handler error" }, { status: 500 });
  }

  return Response.json({ received: true });
}
