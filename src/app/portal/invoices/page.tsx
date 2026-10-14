import { and, desc, eq, ne } from "drizzle-orm";
import { AlertCircle, Download, ExternalLink, Receipt, Wallet } from "lucide-react";
import { db } from "@/db";
import { invoices } from "@/db/schema";
import { requireClient } from "@/lib/session";
import { getStripe } from "@/lib/stripe";
import { Badge, Card, EmptyState } from "@/components/ui";
import { SubmitButton } from "@/components/crm/form-bits";
import { statusTone } from "@/lib/status";
import { money } from "@/lib/utils";
import { fmtDate, invoiceDisplayStatus } from "@/lib/billing/format";
import { openBillingPortalAction } from "../actions";

export const metadata = { title: "Invoices" };

export default async function PortalInvoices({ searchParams }: { searchParams: Promise<{ billing?: string }> }) {
  const { client } = await requireClient();
  if (!client) return null;
  const sp = await searchParams;
  // Drafts are never shown to clients.
  const rows = await db.query.invoices.findMany({
    where: and(eq(invoices.clientId, client.id), ne(invoices.status, "draft")),
    orderBy: desc(invoices.createdAt),
  });
  const open = rows.filter((r) => r.status === "open");
  const balance = open.reduce((a, i) => a + Math.max(0, i.amountDue - i.amountPaid), 0);
  const canManage = !!client.stripeCustomerId && !!getStripe();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Invoices</h1>
          <p className="mt-1 text-sm text-muted">
            {balance > 0 ? (
              <>
                You have <span className="font-semibold text-foreground">{money(balance)}</span> outstanding across {open.length} invoice
                {open.length === 1 ? "" : "s"}.
              </>
            ) : (
              "You’re all paid up."
            )}
          </p>
        </div>
        {canManage && (
          <form action={openBillingPortalAction}>
            <SubmitButton variant="outline" pendingText="Opening…">
              <Wallet className="h-4 w-4" /> Manage payment methods
            </SubmitButton>
          </form>
        )}
      </div>

      {sp.billing && (
        <p role="alert" className="flex items-center gap-2 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertCircle className="h-4 w-4" /> Payment method management isn’t available right now. Please contact us if you need to update your card.
        </p>
      )}

      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState icon={<Receipt className="h-5 w-5" />} title="No invoices yet" description="When we bill you, invoices will appear here." />
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((inv) => {
              const st = invoiceDisplayStatus(inv);
              const due = Math.max(0, inv.amountDue - inv.amountPaid);
              return (
                <li key={inv.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand">
                    <Receipt className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{inv.number ? `Invoice ${inv.number}` : "Invoice"}</p>
                      <Badge tone={statusTone(st)}>{st}</Badge>
                    </div>
                    <p className="truncate text-sm text-muted">
                      {inv.description ? `${inv.description} · ` : ""}
                      {inv.status === "paid"
                        ? `Paid ${fmtDate(inv.paidAt)}`
                        : inv.status === "open"
                          ? inv.dueDate
                            ? `Due ${fmtDate(inv.dueDate)}`
                            : "Due on receipt"
                          : `Issued ${fmtDate(inv.createdAt)}`}
                    </p>
                  </div>
                  <p className="text-right font-bold tabular-nums">{money(inv.status === "open" ? due : inv.amountDue, inv.currency)}</p>
                  <div className="flex w-full gap-2 sm:w-auto">
                    {inv.status === "open" && inv.hostedUrl && (
                      <a
                        href={inv.hostedUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 sm:flex-none"
                      >
                        Pay now
                      </a>
                    )}
                    {inv.status !== "open" && inv.hostedUrl && (
                      <a
                        href={inv.hostedUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface-2 sm:flex-none"
                      >
                        <ExternalLink className="h-4 w-4" /> View
                      </a>
                    )}
                    {inv.pdfUrl && (
                      <a
                        href={inv.pdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Download PDF for ${inv.number ?? "invoice"}`}
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface-2 sm:flex-none"
                      >
                        <Download className="h-4 w-4" /> PDF
                      </a>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <p className="text-xs text-muted">Payments are processed securely by Stripe. We never see or store your card details.</p>
    </div>
  );
}
