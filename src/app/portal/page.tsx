import Link from "next/link";
import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { formatDistanceToNowStrict } from "date-fns";
import { ArrowRight, CalendarClock, CheckCircle2, CreditCard, FileText, MessageSquare, Package } from "lucide-react";
import { db } from "@/db";
import { clientServices, conversations, invoices, messages, proposals } from "@/db/schema";
import { requireClient } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { Badge, Card } from "@/components/ui";
import { statusTone } from "@/lib/status";
import { firstName, money } from "@/lib/utils";
import { fmtDate, intervalLabel, invoiceDisplayStatus } from "@/lib/billing/format";

export const metadata = { title: "Overview" };

export default async function PortalHome() {
  const { client } = await requireClient();
  if (!client) return null;

  const [svc, openInvoices, pendingProposals, convoIds, s] = await Promise.all([
    db.query.clientServices.findMany({
      where: and(eq(clientServices.clientId, client.id), ne(clientServices.status, "cancelled")),
      orderBy: [asc(clientServices.status), asc(clientServices.name)],
    }),
    db.query.invoices.findMany({
      where: and(eq(invoices.clientId, client.id), eq(invoices.status, "open")),
      orderBy: asc(invoices.dueDate),
    }),
    db.query.proposals.findMany({
      where: and(eq(proposals.clientId, client.id), inArray(proposals.status, ["sent", "viewed"])),
      orderBy: desc(proposals.sentAt),
    }),
    db.select({ id: conversations.id }).from(conversations).where(eq(conversations.clientId, client.id)),
    getSettings(),
  ]);
  const recent = convoIds.length
    ? await db
        .select({ id: messages.id, direction: messages.direction, bodyText: messages.bodyText, createdAt: messages.createdAt })
        .from(messages)
        .where(
          and(
            inArray(
              messages.conversationId,
              convoIds.map((c) => c.id),
            ),
            ne(messages.channel, "note"),
          ),
        )
        .orderBy(desc(messages.createdAt))
        .limit(3)
    : [];

  const balance = openInvoices.reduce((a, i) => a + Math.max(0, i.amountDue - i.amountPaid), 0);
  const overdue = openInvoices.filter((i) => invoiceDisplayStatus(i) === "overdue");
  const payTarget = openInvoices.length === 1 ? openInvoices[0]!.hostedUrl : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Welcome back, {firstName(client.name) || "there"}</h1>
        <p className="mt-1 text-sm text-muted">Here’s everything you have with {s.businessName}.</p>
      </div>

      {pendingProposals.length > 0 && (
        <Card className="flex flex-wrap items-center gap-4 border-brand-100 bg-brand-50 p-5">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-surface text-brand">
            <FileText className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">
              {pendingProposals.length === 1 ? "A proposal is waiting for you" : `${pendingProposals.length} proposals are waiting for you`}
            </p>
            <p className="truncate text-sm text-muted">{pendingProposals[0]!.title}</p>
          </div>
          <Link
            href={pendingProposals.length === 1 ? `/p/${pendingProposals[0]!.token}` : "/portal/proposals"}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
          >
            Review <ArrowRight className="h-4 w-4" />
          </Link>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-5 md:col-span-1">
          <p className="flex items-center gap-2 text-sm text-muted">
            <CreditCard className="h-4 w-4" /> Outstanding balance
          </p>
          <p className={`mt-2 text-3xl font-bold tracking-tight ${overdue.length ? "text-danger" : ""}`}>{money(balance)}</p>
          {balance > 0 ? (
            <>
              <p className="mt-1 text-xs text-muted">
                {openInvoices.length} open invoice{openInvoices.length === 1 ? "" : "s"}
                {overdue.length ? ` · ${overdue.length} overdue` : openInvoices[0]?.dueDate ? ` · next due ${fmtDate(openInvoices[0].dueDate)}` : ""}
              </p>
              {payTarget ? (
                <a
                  href={payTarget}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600"
                >
                  Pay now
                </a>
              ) : (
                <Link
                  href="/portal/invoices"
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600"
                >
                  View & pay invoices
                </Link>
              )}
            </>
          ) : (
            <p className="mt-2 flex items-center gap-1.5 text-sm text-green-700">
              <CheckCircle2 className="h-4 w-4" /> You’re all paid up. Thank you!
            </p>
          )}
        </Card>

        <Card className="p-5 md:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <p className="flex items-center gap-2 text-sm text-muted">
              <MessageSquare className="h-4 w-4" /> Recent messages
            </p>
            <Link href="/portal/messages" className="text-sm font-medium text-brand hover:underline">
              Open messages
            </Link>
          </div>
          {recent.length ? (
            <ul className="space-y-3">
              {recent.map((m) => (
                <li key={m.id} className="rounded-lg bg-surface-2 px-3 py-2.5">
                  <p className="text-xs text-muted">
                    {m.direction === "in" ? "You" : s.businessName} · {formatDistanceToNowStrict(m.createdAt, { addSuffix: true })}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-sm">{m.bodyText}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No messages yet. Have a question? Send us a message anytime.</p>
          )}
        </Card>
      </div>

      <section aria-labelledby="svc-heading">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="svc-heading" className="font-semibold">
            Your services
          </h2>
          {svc.length > 0 && (
            <Link href="/portal/services" className="text-sm font-medium text-brand hover:underline">
              View all
            </Link>
          )}
        </div>
        {svc.length ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {svc.slice(0, 4).map((x) => (
              <Card key={x.id} className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="grid h-10 w-10 place-items-center rounded-lg bg-brand-50 text-brand">
                      <Package className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-semibold">{x.name}</p>
                      <p className="text-sm text-muted">
                        {money(x.price, x.currency)}
                        {intervalLabel(x.interval, true)}
                      </p>
                    </div>
                  </div>
                  <Badge tone={statusTone(x.status)}>{x.status}</Badge>
                </div>
                {Object.keys(x.details).length > 0 && (
                  <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    {Object.entries(x.details).map(([k, v]) => (
                      <div key={k} className="min-w-0">
                        <dt className="text-xs text-muted">{k}</dt>
                        <dd className="truncate font-medium" title={v}>
                          {v}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
                {x.renewalDate && (
                  <p className="mt-4 flex items-center gap-1.5 border-t border-border pt-3 text-xs text-muted">
                    <CalendarClock className="h-3.5 w-3.5" /> {x.interval === "one_time" ? "Due" : "Renews"} {fmtDate(x.renewalDate)}
                  </p>
                )}
              </Card>
            ))}
          </div>
        ) : (
          <Card className="p-6 text-sm text-muted">No active services yet.</Card>
        )}
      </section>
    </div>
  );
}
