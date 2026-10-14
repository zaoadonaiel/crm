import Link from "next/link";
import { and, count, desc, eq, ilike, lt, or, sql, type SQL } from "drizzle-orm";
import { AlertTriangle, CheckCircle2, Clock, Plus, Receipt, Wallet } from "lucide-react";
import { db } from "@/db";
import { clients, invoices } from "@/db/schema";
import { requireAdmin } from "@/lib/session";
import { getStripe } from "@/lib/stripe";
import { getSettings } from "@/lib/settings";
import { Avatar, Badge, Card, EmptyState, LinkButton, PageHeader, Stat } from "@/components/ui";
import { ConnectStripeNotice } from "@/components/crm/stripe-notice";
import { statusTone } from "@/lib/status";
import { cn, money } from "@/lib/utils";
import { fmtDate, invoiceDisplayStatus, startOfUtcDay } from "@/lib/billing/format";
import { stripeDashboardUrl } from "@/lib/billing/stripe-sync";
import { InvoiceRowActions } from "./row-actions";
import { InvoiceSearch } from "./search";

export const metadata = { title: "Invoices" };

const PAGE_SIZE = 30;
const FILTERS = ["all", "open", "overdue", "paid", "void", "uncollectible"] as const;
type Filter = (typeof FILTERS)[number];
type SP = { status?: string; q?: string; page?: string; created?: string; sent?: string };

function href(sp: SP, patch: Partial<SP>) {
  const next = { ...sp, ...patch, created: undefined, sent: undefined };
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(next)) if (v && !(k === "page" && v === "1") && !(k === "status" && v === "all")) qs.set(k, v);
  const s = qs.toString();
  return `/invoices${s ? `?${s}` : ""}`;
}

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdmin();
  const sp = await searchParams;
  const filter: Filter = FILTERS.includes(sp.status as Filter) ? (sp.status as Filter) : "all";
  const q = (sp.q ?? "").trim();
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const stripeReady = !!getStripe();
  const now = new Date();
  const today = startOfUtcDay(now);
  const todayIso = today.toISOString();
  const monthAgoIso = new Date(now.getTime() - 30 * 86_400_000).toISOString();

  const conds: SQL[] = [];
  if (filter === "overdue") conds.push(eq(invoices.status, "open"), lt(invoices.dueDate, today));
  else if (filter !== "all") conds.push(eq(invoices.status, filter));
  if (q) {
    const like = `%${q.replace(/[%_\\]/g, "\\$&")}%`;
    conds.push(or(ilike(clients.name, like), ilike(clients.company, like), ilike(invoices.number, like), ilike(invoices.description, like))!);
  }
  const where = conds.length ? and(...conds) : undefined;

  const [rows, [{ total }], [totals], statusCounts, s] = await Promise.all([
    db
      .select({ inv: invoices, client: { id: clients.id, name: clients.name, company: clients.company } })
      .from(invoices)
      .innerJoin(clients, eq(clients.id, invoices.clientId))
      .where(where)
      .orderBy(desc(invoices.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: count() }).from(invoices).innerJoin(clients, eq(clients.id, invoices.clientId)).where(where),
    db
      .select({
        outstanding: sql<number>`coalesce(sum(case when ${invoices.status} = 'open' then ${invoices.amountDue} - ${invoices.amountPaid} else 0 end), 0)::int`,
        openCount: sql<number>`count(*) filter (where ${invoices.status} = 'open')::int`,
        overdue: sql<number>`coalesce(sum(case when ${invoices.status} = 'open' and ${invoices.dueDate} < ${todayIso}::timestamptz then ${invoices.amountDue} - ${invoices.amountPaid} else 0 end), 0)::int`,
        overdueCount: sql<number>`count(*) filter (where ${invoices.status} = 'open' and ${invoices.dueDate} < ${todayIso}::timestamptz)::int`,
        paid30: sql<number>`coalesce(sum(case when ${invoices.status} = 'paid' and ${invoices.paidAt} >= ${monthAgoIso}::timestamptz then ${invoices.amountPaid} else 0 end), 0)::int`,
        paid30Count: sql<number>`count(*) filter (where ${invoices.status} = 'paid' and ${invoices.paidAt} >= ${monthAgoIso}::timestamptz)::int`,
      })
      .from(invoices),
    db.select({ status: invoices.status, n: count() }).from(invoices).groupBy(invoices.status),
    getSettings(),
  ]);

  const counts: Record<string, number> = { all: 0, overdue: totals?.overdueCount ?? 0 };
  for (const c of statusCounts) {
    counts[c.status] = c.n;
    counts.all += c.n;
  }
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <PageHeader
        title="Invoices"
        description="Bill clients through Stripe and get paid faster with automatic reminders."
        icon={<Receipt className="h-5 w-5" />}
        actions={
          stripeReady ? (
            <LinkButton href="/invoices/new">
              <Plus className="h-4 w-4" /> New invoice
            </LinkButton>
          ) : null
        }
      />
      <div className="space-y-6 p-4 sm:p-6">
        {!stripeReady && <ConnectStripeNotice />}
        {sp.created && (
          <div role="status" className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
            <CheckCircle2 className="h-4 w-4" /> Invoice created{sp.sent ? " and emailed to your client" : ""}.
          </div>
        )}

        <Card className="grid grid-cols-1 divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <Stat label="Outstanding" value={money(totals?.outstanding ?? 0)} sub={`${totals?.openCount ?? 0} open invoices`} icon={<Clock className="h-5 w-5" />} />
          <Stat
            label="Overdue"
            value={<span className={(totals?.overdue ?? 0) > 0 ? "text-danger" : ""}>{money(totals?.overdue ?? 0)}</span>}
            sub={`${totals?.overdueCount ?? 0} past due`}
            icon={<AlertTriangle className="h-5 w-5" />}
          />
          <Stat label="Paid (last 30 days)" value={money(totals?.paid30 ?? 0)} sub={`${totals?.paid30Count ?? 0} payments`} icon={<Wallet className="h-5 w-5" />} />
        </Card>

        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border">
          <nav aria-label="Filter by status" className="-mb-px flex gap-1 overflow-x-auto">
            {FILTERS.map((f) => {
              const active = filter === f;
              return (
                <Link
                  key={f}
                  href={href(sp, { status: f, page: "1" })}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm capitalize",
                    active ? "border-brand font-semibold" : "border-transparent text-muted hover:text-foreground",
                  )}
                >
                  {f}
                  <span className={cn("rounded-full px-1.5 text-[11px] font-semibold", f === "overdue" && counts.overdue ? "bg-red-50 text-red-700" : "bg-black/5 text-muted")}>
                    {counts[f] ?? 0}
                  </span>
                </Link>
              );
            })}
          </nav>
          <div className="mb-2">
            <InvoiceSearch q={q} status={filter} />
          </div>
        </div>

        {!s.invoiceRemindersEnabled && (
          <p className="text-xs text-muted">
            Automatic reminders are turned off globally in{" "}
            <Link href="/settings" className="text-brand underline">
              Settings
            </Link>
            .
          </p>
        )}

        <Card className="overflow-hidden">
          {rows.length === 0 ? (
            <EmptyState
              icon={<Receipt className="h-5 w-5" />}
              title={filter === "all" && !q ? "No invoices yet" : "No invoices match"}
              description={filter === "all" && !q ? "Create an invoice and we'll email your client a secure Stripe payment link." : "Try another filter."}
              action={
                stripeReady && filter === "all" && !q ? (
                  <LinkButton href="/invoices/new">
                    <Plus className="h-4 w-4" /> New invoice
                  </LinkButton>
                ) : undefined
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead>
                  <tr className="bg-surface-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                    <th className="border-b border-border px-4 py-3">Invoice</th>
                    <th className="border-b border-border px-4 py-3">Client</th>
                    <th className="border-b border-border px-4 py-3">Status</th>
                    <th className="border-b border-border px-4 py-3 text-right">Amount</th>
                    <th className="border-b border-border px-4 py-3">Due</th>
                    <th className="border-b border-border px-4 py-3">Reminders</th>
                    <th className="border-b border-border px-4 py-3">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ inv, client }) => {
                    const st = invoiceDisplayStatus(inv);
                    return (
                      <tr key={inv.id} className="hover:bg-surface-2">
                        <td className="border-b border-border px-4 py-3">
                          <p className="font-semibold">{inv.number ?? "Draft"}</p>
                          {inv.description && <p className="max-w-64 truncate text-xs text-muted">{inv.description}</p>}
                        </td>
                        <td className="border-b border-border px-4 py-3">
                          <Link href={`/clients/${client.id}`} className="flex items-center gap-2 hover:text-brand">
                            <Avatar name={client.name} size={26} />
                            <span className="truncate">{client.company || client.name}</span>
                          </Link>
                        </td>
                        <td className="border-b border-border px-4 py-3">
                          <Badge tone={statusTone(st)}>{st}</Badge>
                        </td>
                        <td className="border-b border-border px-4 py-3 text-right tabular-nums">
                          <span className="font-semibold">{money(inv.amountDue, inv.currency)}</span>
                          {inv.amountPaid > 0 && inv.status !== "paid" && (
                            <p className="text-xs text-muted">{money(inv.amountPaid, inv.currency)} paid</p>
                          )}
                        </td>
                        <td className="border-b border-border px-4 py-3 text-muted">
                          {inv.status === "paid" ? <span className="text-green-700">Paid {fmtDate(inv.paidAt)}</span> : fmtDate(inv.dueDate)}
                        </td>
                        <td className="border-b border-border px-4 py-3 text-xs text-muted">
                          {inv.status === "open" ? (
                            <>
                              {inv.remindersEnabled ? "On" : "Off"}
                              {inv.reminderCount > 0 && ` · ${inv.reminderCount} sent`}
                              {inv.lastReminderAt && <span className="block">Last {fmtDate(inv.lastReminderAt)}</span>}
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="border-b border-border px-4 py-3 text-right">
                          <InvoiceRowActions
                            id={inv.id}
                            status={inv.status}
                            remindersEnabled={inv.remindersEnabled}
                            hostedUrl={inv.hostedUrl}
                            pdfUrl={inv.pdfUrl}
                            stripeUrl={inv.stripeInvoiceId ? stripeDashboardUrl(inv.stripeInvoiceId) : null}
                            stripeReady={stripeReady}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {total > PAGE_SIZE && (
            <div className="flex items-center justify-between px-4 py-3 text-sm text-muted">
              <span>
                Page {page} of {pages}
              </span>
              <div className="flex gap-1">
                {page > 1 && (
                  <Link className="rounded-lg border border-border bg-surface px-3 py-1.5 text-foreground hover:bg-surface-2" href={href(sp, { page: String(page - 1) })}>
                    Previous
                  </Link>
                )}
                {page < pages && (
                  <Link className="rounded-lg border border-border bg-surface px-3 py-1.5 text-foreground hover:bg-surface-2" href={href(sp, { page: String(page + 1) })}>
                    Next
                  </Link>
                )}
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
