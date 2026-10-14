import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { formatDistanceToNowStrict } from "date-fns";
import {
  Activity,
  ArrowLeft,
  CheckCircle2,
  FileText,
  Mail,
  MessageSquare,
  Plus,
  Receipt,
  Send,
} from "lucide-react";
import { db } from "@/db";
import { activities, clientServices, clients, conversations, invoices, messages, proposals, services, session } from "@/db/schema";
import { requireAdmin } from "@/lib/session";
import { Badge, Button, Card, CardHeader, EmptyState, LinkButton } from "@/components/ui";
import { statusTone } from "@/lib/status";
import { money } from "@/lib/utils";
import { fmtDate, invoiceDisplayStatus } from "@/lib/billing/format";
import { createProposalForClientAction, startConversationAction } from "../actions";
import { ProfileCard } from "./profile-card";
import { ServicesPanel, type CatalogItem, type ClientServiceItem } from "./services-panel";
import { PortalCard } from "./portal-card";

export const metadata = { title: "Client" };

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const client = await db.query.clients.findFirst({ where: eq(clients.id, id) });
  if (!client) notFound();

  const [svcRows, catalog, props, invs, acts, convos] = await Promise.all([
    db.query.clientServices.findMany({ where: eq(clientServices.clientId, id), orderBy: [asc(clientServices.status), desc(clientServices.createdAt)] }),
    db.query.services.findMany({ where: eq(services.active, true), orderBy: asc(services.name) }),
    db.query.proposals.findMany({ where: eq(proposals.clientId, id), orderBy: desc(proposals.createdAt) }),
    db.query.invoices.findMany({ where: eq(invoices.clientId, id), orderBy: desc(invoices.createdAt) }),
    db.query.activities.findMany({ where: eq(activities.clientId, id), orderBy: desc(activities.createdAt), limit: 40 }),
    db.query.conversations.findMany({ where: eq(conversations.clientId, id), orderBy: desc(conversations.lastMessageAt), limit: 5 }),
  ]);
  const lastSession = client.userId
    ? await db.query.session.findFirst({ where: eq(session.userId, client.userId), orderBy: desc(session.createdAt), columns: { createdAt: true } })
    : undefined;
  const lastMsg = convos.length
    ? await db.query.messages.findFirst({
        where: and(
          inArray(
            messages.conversationId,
            convos.map((c) => c.id),
          ),
          ne(messages.channel, "note"),
        ),
        orderBy: desc(messages.createdAt),
      })
    : undefined;

  const openBalance = invs.filter((i) => i.status === "open").reduce((a, i) => a + (i.amountDue - i.amountPaid), 0);
  const lifetime = invs.reduce((a, i) => a + i.amountPaid, 0);
  const mrr = svcRows
    .filter((s) => s.status === "active")
    .reduce((a, s) => a + (s.interval === "month" ? s.price : s.interval === "year" ? Math.round(s.price / 12) : 0), 0);
  const activeServices = svcRows.filter((s) => s.status === "active");

  const svcItems: ClientServiceItem[] = svcRows.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    status: s.status,
    price: s.price,
    currency: s.currency,
    interval: s.interval,
    startDate: s.startDate?.toISOString() ?? null,
    renewalDate: s.renewalDate?.toISOString() ?? null,
    details: s.details,
  }));
  const catalogItems: CatalogItem[] = catalog.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    price: s.price,
    interval: s.interval,
  }));

  return (
    <div>
      <div className="border-b border-border bg-surface px-4 py-3 sm:px-6">
        <Link href="/clients" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> All clients
        </Link>
      </div>

      <div className="grid gap-6 p-4 sm:p-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <ProfileCard
            client={{
              id: client.id,
              name: client.name,
              email: client.email,
              company: client.company,
              phone: client.phone,
              website: client.website,
              status: client.status,
              tags: client.tags,
              notes: client.notes,
              createdAt: client.createdAt.toISOString(),
            }}
          />

          <Card>
            <div className="grid grid-cols-2 divide-border sm:grid-cols-4 sm:divide-x">
              <MiniStat label="Open balance" value={money(openBalance)} highlight={openBalance > 0} />
              <MiniStat label="Lifetime paid" value={money(lifetime)} />
              <MiniStat label="Recurring / mo" value={money(mrr)} />
              <MiniStat label="Active services" value={String(activeServices.length)} />
            </div>
          </Card>

          <ServicesPanel clientId={client.id} items={svcItems} catalog={catalogItems} />

          <Card>
            <CardHeader
              title="Proposals"
              description="Quotes you've sent this client"
              icon={<FileText className="h-5 w-5" />}
              action={
                <form action={createProposalForClientAction.bind(null, client.id)}>
                  <Button size="sm" variant="secondary">
                    <Plus className="h-4 w-4" /> New proposal
                  </Button>
                </form>
              }
            />
            {props.length ? (
              <ul className="divide-y divide-border">
                {props.map((p) => (
                  <li key={p.id}>
                    <Link href={`/proposals/${p.id}`} className="flex items-center gap-4 px-5 py-3 hover:bg-surface-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{p.title}</p>
                        <p className="text-xs text-muted">
                          {p.sentAt ? `Sent ${fmtDate(p.sentAt)}` : `Created ${fmtDate(p.createdAt)}`}
                          {p.viewedAt ? ` · Viewed ${fmtDate(p.viewedAt)}` : ""}
                        </p>
                      </div>
                      <span className="tabular-nums font-semibold">{money(p.amount, p.currency)}</span>
                      <Badge tone={statusTone(p.status)}>{p.status}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 py-6 text-sm text-muted">No proposals yet.</p>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Invoices"
              description="Synced with Stripe"
              icon={<Receipt className="h-5 w-5" />}
              action={
                <div className="flex gap-2">
                  {activeServices.length > 0 && (
                    <LinkButton href={`/invoices/new?client=${client.id}&services=1`} size="sm" variant="outline">
                      Bill services
                    </LinkButton>
                  )}
                  <LinkButton href={`/invoices/new?client=${client.id}`} size="sm" variant="secondary">
                    <Plus className="h-4 w-4" /> New invoice
                  </LinkButton>
                </div>
              }
            />
            {invs.length ? (
              <ul className="divide-y divide-border">
                {invs.map((i) => {
                  const st = invoiceDisplayStatus(i);
                  return (
                    <li key={i.id} className="flex items-center gap-4 px-5 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">
                          {i.number ?? "Draft invoice"}
                          {i.description && <span className="font-normal text-muted"> · {i.description}</span>}
                        </p>
                        <p className="text-xs text-muted">
                          {i.status === "paid" ? `Paid ${fmtDate(i.paidAt)}` : i.dueDate ? `Due ${fmtDate(i.dueDate)}` : `Created ${fmtDate(i.createdAt)}`}
                        </p>
                      </div>
                      <span className="tabular-nums font-semibold">{money(i.amountDue, i.currency)}</span>
                      <Badge tone={statusTone(st)}>{st}</Badge>
                      {i.hostedUrl && (
                        <a href={i.hostedUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-brand hover:underline">
                          View
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="px-5 py-6 text-sm text-muted">No invoices yet.</p>
            )}
          </Card>

          <Card>
            <CardHeader title="Activity" description="Everything that's happened with this client" icon={<Activity className="h-5 w-5" />} />
            {acts.length ? (
              <ol className="relative space-y-0 px-5 py-4">
                {acts.map((a, idx) => (
                  <li key={a.id} className="relative flex gap-3 pb-4 last:pb-0">
                    {idx < acts.length - 1 && <span className="absolute left-[7px] top-4 h-full w-px bg-border" aria-hidden />}
                    <span className="relative mt-1 h-[15px] w-[15px] shrink-0 rounded-full border-2 border-brand bg-surface" aria-hidden />
                    <div className="min-w-0">
                      <p className="text-sm">{a.summary}</p>
                      <p className="text-xs text-muted" title={a.createdAt.toISOString()}>
                        {formatDistanceToNowStrict(a.createdAt, { addSuffix: true })}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <EmptyState title="No activity yet" description="Emails, proposals, invoices and payments will show up here." />
            )}
          </Card>
        </div>

        <aside className="space-y-6">
          <Card>
            <CardHeader title="Conversation" icon={<MessageSquare className="h-5 w-5" />} />
            <div className="space-y-4 p-5">
              {lastMsg ? (
                <div className="rounded-lg bg-surface-2 p-3 text-sm">
                  <p className="mb-1 flex items-center gap-1.5 text-xs text-muted">
                    <Mail className="h-3.5 w-3.5" />
                    {lastMsg.direction === "in" ? `${client.name.split(" ")[0]} wrote` : "You wrote"} ·{" "}
                    {formatDistanceToNowStrict(lastMsg.createdAt, { addSuffix: true })}
                  </p>
                  <p className="line-clamp-3 text-foreground/90">{lastMsg.bodyText}</p>
                </div>
              ) : (
                <p className="text-sm text-muted">No messages yet.</p>
              )}
              <dl className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <dt className="text-muted">Last contacted</dt>
                  <dd className="font-medium">{client.lastContactedAt ? formatDistanceToNowStrict(client.lastContactedAt, { addSuffix: true }) : "Never"}</dd>
                </div>
                <div>
                  <dt className="text-muted">Last replied</dt>
                  <dd className="font-medium">{client.lastRepliedAt ? formatDistanceToNowStrict(client.lastRepliedAt, { addSuffix: true }) : "Never"}</dd>
                </div>
              </dl>
              <div className="flex flex-wrap gap-2">
                <form action={startConversationAction.bind(null, client.id)} className="flex-1">
                  <Button className="w-full justify-center">
                    <Send className="h-4 w-4" /> Send message
                  </Button>
                </form>
                {convos[0] && (
                  <LinkButton href={`/inbox?c=${convos[0].id}`} variant="outline" className="flex-1 justify-center">
                    Open in inbox
                  </LinkButton>
                )}
              </div>
            </div>
          </Card>

          <PortalCard
            clientId={client.id}
            email={client.email}
            linked={!!client.userId}
            lastLogin={lastSession?.createdAt.toISOString() ?? null}
          />

          {client.status === "lead" && props.length === 0 && (
            <Card className="border-dashed p-5">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <CheckCircle2 className="h-4 w-4 text-brand" /> Next step
              </p>
              <p className="mt-1 text-sm text-muted">Send {client.name.split(" ")[0]} a proposal — they’ll move to Prospect automatically.</p>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}

function MiniStat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="px-5 py-4">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-lg font-bold tabular-nums ${highlight ? "text-brand" : ""}`}>{value}</p>
    </div>
  );
}
