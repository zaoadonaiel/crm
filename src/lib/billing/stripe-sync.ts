/**
 * Stripe ⇄ local invoice mirror.
 *
 * Stripe is the source of truth for invoices; we keep a local copy in
 * `invoices` (upserted here and from the webhook) so lists, reminders and the
 * client portal never have to hit the Stripe API.
 *
 * We send our own branded invoice / reminder emails (auto_advance is off, so
 * Stripe never emails the customer itself), linking to Stripe's hosted page.
 */
import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { clients, invoices } from "@/db/schema";
import { requireStripe } from "@/lib/stripe";
import { sendEmail } from "@/lib/email/send";
import { noticeEmailHtml } from "@/lib/email/transactional";
import { logActivity } from "@/lib/conversations";
import { enrollForTrigger, stopEnrollmentsForRef } from "@/lib/automations/enroll";
import { firstName, money } from "@/lib/utils";
import { fmtDate } from "@/lib/billing/format";

export type InvoiceRow = typeof invoices.$inferSelect;
export type LineItemInput = { description: string; amountCents: number; quantity: number };

type LocalStatus = InvoiceRow["status"];

/** Returns (creating if needed) the Stripe customer id for a client. */
export async function ensureStripeCustomer(clientId: string): Promise<string> {
  const stripe = requireStripe();
  const client = await db.query.clients.findFirst({ where: eq(clients.id, clientId) });
  if (!client) throw new Error("Client not found");

  if (client.stripeCustomerId) {
    try {
      const existing = await stripe.customers.retrieve(client.stripeCustomerId);
      if (!("deleted" in existing && existing.deleted)) return existing.id;
    } catch {
      // customer missing (e.g. switched test/live keys) — fall through and recreate
    }
  }

  // Reuse a customer that already exists in Stripe for this email, if any.
  const found = await stripe.customers.list({ email: client.email, limit: 1 });
  const customer =
    found.data[0] ??
    (await stripe.customers.create({
      email: client.email,
      name: client.company ? `${client.name} (${client.company})` : client.name,
      phone: client.phone ?? undefined,
      metadata: { clientId: client.id },
    }));

  await db.update(clients).set({ stripeCustomerId: customer.id }).where(eq(clients.id, client.id));
  return customer.id;
}

function customerIdOf(inv: Stripe.Invoice) {
  const c = inv.customer;
  if (!c) return null;
  return typeof c === "string" ? c : c.id;
}

function toDate(unix: number | null | undefined) {
  return unix ? new Date(unix * 1000) : null;
}

function describe(inv: Stripe.Invoice) {
  if (inv.description) return inv.description;
  const lines = inv.lines?.data ?? [];
  if (!lines.length) return null;
  const first = lines[0]!.description ?? "Invoice";
  return lines.length > 1 ? `${first} + ${lines.length - 1} more` : first;
}

/**
 * Insert/update our local mirror from a Stripe invoice object.
 * Returns null if the invoice can't be matched to a client.
 */
export async function upsertInvoiceFromStripe(
  inv: Stripe.Invoice,
): Promise<{ row: InvoiceRow; previousStatus: LocalStatus | null } | null> {
  const existing = await db.query.invoices.findFirst({ where: eq(invoices.stripeInvoiceId, inv.id) });

  let clientId = existing?.clientId ?? inv.metadata?.clientId ?? null;
  if (clientId && !existing) {
    const ok = await db.query.clients.findFirst({ where: eq(clients.id, clientId), columns: { id: true } });
    if (!ok) clientId = null;
  }
  if (!clientId) {
    const customerId = customerIdOf(inv);
    if (customerId) {
      const c = await db.query.clients.findFirst({ where: eq(clients.stripeCustomerId, customerId), columns: { id: true } });
      clientId = c?.id ?? null;
    }
  }
  if (!clientId && inv.customer_email) {
    const c = await db.query.clients.findFirst({
      where: eq(clients.email, inv.customer_email.toLowerCase()),
      columns: { id: true },
    });
    clientId = c?.id ?? null;
  }
  if (!clientId) return null;

  const status = (inv.status ?? "draft") as LocalStatus;
  const values = {
    clientId,
    stripeInvoiceId: inv.id,
    number: inv.number,
    description: describe(inv),
    amountDue: inv.amount_due,
    amountPaid: inv.amount_paid,
    currency: inv.currency,
    status,
    dueDate: toDate(inv.due_date),
    paidAt: toDate(inv.status_transitions?.paid_at) ?? (status === "paid" ? (existing?.paidAt ?? new Date()) : null),
    hostedUrl: inv.hosted_invoice_url ?? null,
    pdfUrl: inv.invoice_pdf ?? null,
  };

  const [row] = await db
    .insert(invoices)
    .values(values)
    .onConflictDoUpdate({
      target: invoices.stripeInvoiceId,
      set: {
        number: values.number,
        description: values.description,
        amountDue: values.amountDue,
        amountPaid: values.amountPaid,
        currency: values.currency,
        status: values.status,
        dueDate: values.dueDate,
        paidAt: values.paidAt,
        hostedUrl: values.hostedUrl,
        pdfUrl: values.pdfUrl,
      },
    })
    .returning();
  return { row: row!, previousStatus: existing?.status ?? null };
}

/** Side effects when an invoice becomes paid (idempotent on status transition). */
export async function handleInvoicePaid(row: InvoiceRow, previousStatus: LocalStatus | null) {
  if (row.status !== "paid" || previousStatus === "paid") return;
  await stopEnrollmentsForRef(row.id, "paid");
  await db.update(clients).set({ status: "active" }).where(eq(clients.id, row.clientId));
  await logActivity(
    row.clientId,
    "invoice.paid",
    `Paid invoice ${row.number ?? ""} (${money(row.amountPaid || row.amountDue, row.currency)})`.replace("  ", " "),
    { invoiceId: row.id },
  );
}

/**
 * Create a Stripe invoice (send_invoice collection), attach line items,
 * finalize it, mirror it locally and optionally email it to the client.
 */
export async function createInvoice(opts: {
  clientId: string;
  items: LineItemInput[];
  daysUntilDue: number;
  memo?: string | null;
  send: boolean;
  currency?: string;
}): Promise<InvoiceRow> {
  const stripe = requireStripe();
  const items = opts.items.filter((i) => i.description.trim() && i.amountCents > 0 && i.quantity > 0);
  if (!items.length) throw new Error("Add at least one line item with an amount.");
  const currency = (opts.currency ?? "usd").toLowerCase();
  const customer = await ensureStripeCustomer(opts.clientId);

  const draft = await stripe.invoices.create({
    customer,
    collection_method: "send_invoice",
    days_until_due: Math.max(0, Math.min(365, Math.round(opts.daysUntilDue))),
    description: opts.memo?.trim() || undefined,
    auto_advance: false,
    pending_invoice_items_behavior: "exclude",
    currency,
    metadata: { clientId: opts.clientId },
  });

  for (const item of items) {
    const qty = Math.round(item.quantity);
    await stripe.invoiceItems.create({
      customer,
      invoice: draft.id,
      currency,
      amount: Math.round(item.amountCents) * qty,
      description: qty > 1 ? `${item.description.trim()} × ${qty} @ ${money(item.amountCents, currency)}` : item.description.trim(),
    });
  }

  const finalized = await stripe.invoices.finalizeInvoice(draft.id, { auto_advance: false });
  const result = await upsertInvoiceFromStripe(finalized);
  if (!result) throw new Error("Could not link the Stripe invoice to this client.");
  const row = result.row;

  await logActivity(opts.clientId, "invoice.created", `Created invoice ${row.number ?? ""} for ${money(row.amountDue, row.currency)}`, {
    invoiceId: row.id,
  });

  if (opts.send) await sendInvoiceEmail(row.id);
  return row;
}

/** Email our branded "new invoice" notice and start the invoice_sent sequence. */
export async function sendInvoiceEmail(invoiceId: string) {
  const inv = await db.query.invoices.findFirst({ where: eq(invoices.id, invoiceId), with: { client: true } });
  if (!inv) throw new Error("Invoice not found");
  if (!inv.hostedUrl) throw new Error("This invoice has no payment link yet.");
  const amount = money(inv.amountDue - inv.amountPaid, inv.currency);
  const label = inv.number ? `Invoice ${inv.number}` : "Your invoice";

  await sendEmail({
    to: inv.client.email,
    subject: `${label} — ${amount}${inv.dueDate ? ` due ${fmtDate(inv.dueDate)}` : ""}`,
    html: await noticeEmailHtml({
      heading: `${label} for ${amount}`,
      bodyText: [
        `Hi ${firstName(inv.client.name) || "there"},`,
        `Here's ${inv.number ? `invoice ${inv.number}` : "your invoice"}${inv.description ? ` for ${inv.description}` : ""}. The total is ${amount}${
          inv.dueDate ? `, due ${fmtDate(inv.dueDate)}` : ""
        }.`,
        "You can view the details, download a PDF and pay securely online using the button below.",
        "Thank you for your business!",
      ].join("\n\n"),
      cta: { label: "View & pay invoice", url: inv.hostedUrl },
      footnote: "Payments are processed securely by Stripe. Reply to this email if you have any questions.",
    }),
    tags: { invoice_id: inv.id },
  });

  await db.update(clients).set({ lastContactedAt: new Date() }).where(eq(clients.id, inv.clientId));
  await logActivity(inv.clientId, "invoice.sent", `Sent ${label.toLowerCase()} (${amount})`, { invoiceId: inv.id });
  await enrollForTrigger("invoice_sent", inv.clientId, { type: "invoice", id: inv.id });
}

export async function voidInvoice(invoiceId: string) {
  const stripe = requireStripe();
  const inv = await db.query.invoices.findFirst({ where: eq(invoices.id, invoiceId) });
  if (!inv?.stripeInvoiceId) throw new Error("Invoice not found");
  const voided = await stripe.invoices.voidInvoice(inv.stripeInvoiceId);
  await upsertInvoiceFromStripe(voided);
  await stopEnrollmentsForRef(inv.id, "voided");
  await logActivity(inv.clientId, "invoice.voided", `Voided invoice ${inv.number ?? ""}`.trim(), { invoiceId: inv.id });
}

/** Pull the latest state of one invoice from Stripe (handy if a webhook was missed). */
export async function refreshInvoiceFromStripe(invoiceId: string) {
  const stripe = requireStripe();
  const inv = await db.query.invoices.findFirst({ where: eq(invoices.id, invoiceId) });
  if (!inv?.stripeInvoiceId) return null;
  const fresh = await stripe.invoices.retrieve(inv.stripeInvoiceId);
  const res = await upsertInvoiceFromStripe(fresh);
  if (res) await handleInvoicePaid(res.row, res.previousStatus);
  return res?.row ?? null;
}

export function stripeDashboardUrl(stripeInvoiceId: string) {
  const test = (process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_test") || (process.env.STRIPE_SECRET_KEY ?? "").startsWith("rk_test");
  return `https://dashboard.stripe.com/${test ? "test/" : ""}invoices/${stripeInvoiceId}`;
}
