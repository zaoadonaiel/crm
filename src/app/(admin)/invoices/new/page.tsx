import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { ArrowLeft, Receipt } from "lucide-react";
import { db } from "@/db";
import { clientServices, clients, services } from "@/db/schema";
import { requireAdmin } from "@/lib/session";
import { getStripe } from "@/lib/stripe";
import { PageHeader } from "@/components/ui";
import { ConnectStripeNotice } from "@/components/crm/stripe-notice";
import { intervalLabel } from "@/lib/billing/format";
import { InvoiceForm, type DraftItem } from "./invoice-form";

export const metadata = { title: "New invoice" };

export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<{ client?: string; services?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const stripeReady = !!getStripe();

  const [clientList, catalog] = await Promise.all([
    db.select({ id: clients.id, name: clients.name, company: clients.company, email: clients.email }).from(clients).orderBy(asc(clients.name)),
    db.query.services.findMany({ where: eq(services.active, true), orderBy: asc(services.name) }),
  ]);

  const preselected = sp.client && clientList.some((c) => c.id === sp.client) ? sp.client : "";
  let initialItems: DraftItem[] = [];
  if (preselected && sp.services) {
    const active = await db.query.clientServices.findMany({
      where: and(eq(clientServices.clientId, preselected), eq(clientServices.status, "active")),
      orderBy: asc(clientServices.name),
    });
    initialItems = active
      .filter((s) => s.price > 0)
      .map((s) => ({
        description: s.interval === "one_time" ? s.name : `${s.name} (${intervalLabel(s.interval).toLowerCase()})`,
        amount: (s.price / 100).toFixed(2),
        quantity: "1",
      }));
  }

  return (
    <div>
      <div className="border-b border-border bg-surface px-4 py-3 sm:px-6">
        <Link href={preselected ? `/clients/${preselected}` : "/invoices"} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
      </div>
      <PageHeader title="New invoice" description="Creates a Stripe invoice with a secure payment page." icon={<Receipt className="h-5 w-5" />} />
      <div className="mx-auto max-w-4xl p-4 sm:p-6">
        {stripeReady ? (
          <InvoiceForm
            clients={clientList}
            catalog={catalog.map((c) => ({ id: c.id, name: c.name, price: c.price, interval: c.interval }))}
            initialClientId={preselected}
            initialItems={initialItems}
          />
        ) : (
          <ConnectStripeNotice />
        )}
      </div>
    </div>
  );
}
