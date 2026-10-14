/**
 * Friendly, escalating invoice reminders.
 *
 * `sendInvoiceReminders()` is run daily by the job runner (src/lib/jobs). For
 * every open invoice with reminders on, it sends one email when today (UTC) is
 * one of `settings.invoiceReminderDays` relative to the due date
 * (negative = before due), at most once per day.
 */
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { clients, invoices } from "@/db/schema";
import { getSettings } from "@/lib/settings";
import { sendEmail } from "@/lib/email/send";
import { noticeEmailHtml } from "@/lib/email/transactional";
import { logActivity } from "@/lib/conversations";
import { firstName, money } from "@/lib/utils";
import { daysPastDue, fmtDate, startOfUtcDay } from "@/lib/billing/format";

type InvoiceWithClient = typeof invoices.$inferSelect & { client: typeof clients.$inferSelect };

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export function reminderCopy(inv: InvoiceWithClient, today = new Date()) {
  const amount = money(Math.max(0, inv.amountDue - inv.amountPaid), inv.currency);
  const ref = inv.number ? `invoice ${inv.number}` : "your invoice";
  const Ref = inv.number ? `Invoice ${inv.number}` : "Your invoice";
  const hi = `Hi ${firstName(inv.client.name) || "there"},`;
  const due = inv.dueDate ? fmtDate(inv.dueDate) : "soon";
  const d = inv.dueDate ? daysPastDue(inv.dueDate, today) : 0;

  if (d < 0) {
    return {
      subject: `Friendly reminder: ${ref} is due ${d === -1 ? "tomorrow" : `in ${plural(-d, "day")}`}`,
      heading: `${Ref} is coming up`,
      body: [
        hi,
        `Just a quick heads-up that ${ref} for ${amount} is due on ${due}.`,
        "You can pay online in a minute using the button below. If you've already taken care of it, thank you — please ignore this note.",
      ],
      cta: "View & pay invoice",
    };
  }
  if (d === 0) {
    return {
      subject: `${Ref} is due today`,
      heading: `${Ref} is due today`,
      body: [
        hi,
        `A friendly reminder that ${ref} for ${amount} is due today (${due}).`,
        "You can pay securely online using the button below. Thanks so much!",
      ],
      cta: "Pay now",
    };
  }
  if (d < 7) {
    return {
      subject: `${Ref} is ${plural(d, "day")} overdue`,
      heading: `${Ref} is now overdue`,
      body: [
        hi,
        `It looks like ${ref} for ${amount} was due on ${due} and is now ${plural(d, "day")} past due. It may have just slipped through the cracks!`,
        "You can pay online using the button below. If there's any problem with the invoice, just reply and let me know.",
      ],
      cta: "Pay invoice",
    };
  }
  return {
    subject: `Overdue: ${ref} (${amount}) — ${plural(d, "day")} past due`,
    heading: `${Ref} is ${plural(d, "day")} overdue`,
    body: [
      hi,
      `I'm following up on ${ref} for ${amount}, which was due on ${due} and is now ${plural(d, "day")} overdue.`,
      "Please arrange payment as soon as possible using the button below. If something's holding it up, reply to this email so we can sort it out together.",
    ],
    cta: "Pay invoice",
  };
}

/** Send one reminder for an invoice right now (also used by "Send reminder now"). */
export async function sendInvoiceReminder(invoiceId: string, opts: { manual?: boolean } = {}) {
  const inv = await db.query.invoices.findFirst({ where: eq(invoices.id, invoiceId), with: { client: true } });
  if (!inv) throw new Error("Invoice not found");
  if (inv.status !== "open") throw new Error("Only open invoices can be reminded.");
  if (!inv.hostedUrl) throw new Error("This invoice has no payment link.");

  const copy = reminderCopy(inv);
  await sendEmail({
    to: inv.client.email,
    subject: copy.subject,
    html: await noticeEmailHtml({
      heading: copy.heading,
      bodyText: copy.body.join("\n\n"),
      cta: { label: copy.cta, url: inv.hostedUrl },
      footnote: "Payments are processed securely by Stripe.",
    }),
    tags: { invoice_id: inv.id, kind: "invoice_reminder" },
  });

  const now = new Date();
  await db
    .update(invoices)
    .set({ reminderCount: inv.reminderCount + 1, lastReminderAt: now })
    .where(eq(invoices.id, inv.id));
  await db.update(clients).set({ lastContactedAt: now }).where(eq(clients.id, inv.clientId));
  await logActivity(
    inv.clientId,
    "invoice.reminder",
    `${opts.manual ? "Sent" : "Auto-sent"} payment reminder for invoice ${inv.number ?? ""}`.replace(/\s+$/, ""),
    { invoiceId: inv.id, subject: copy.subject },
  );
  return copy.subject;
}

export async function sendInvoiceReminders() {
  const s = await getSettings();
  if (!s.invoiceRemindersEnabled) return { enabled: false, checked: 0, sent: 0, failed: 0 };
  const days = new Set((s.invoiceReminderDays ?? []).map((n) => Math.round(Number(n))).filter((n) => Number.isFinite(n)));
  if (!days.size) return { enabled: true, checked: 0, sent: 0, failed: 0 };

  const now = new Date();
  const todayStart = startOfUtcDay(now).getTime();
  const open = await db.query.invoices.findMany({
    where: and(eq(invoices.status, "open"), eq(invoices.remindersEnabled, true), isNotNull(invoices.dueDate)),
    columns: { id: true, dueDate: true, lastReminderAt: true, amountDue: true, amountPaid: true },
  });

  let sent = 0;
  let failed = 0;
  const errors: { invoiceId: string; error: string }[] = [];
  for (const inv of open) {
    if (inv.amountDue - inv.amountPaid <= 0) continue;
    if (!days.has(daysPastDue(inv.dueDate!, now))) continue;
    if (inv.lastReminderAt && inv.lastReminderAt.getTime() >= todayStart) continue;
    try {
      await sendInvoiceReminder(inv.id);
      sent++;
    } catch (err) {
      failed++;
      errors.push({ invoiceId: inv.id, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return { enabled: true, checked: open.length, sent, failed, errors };
}
