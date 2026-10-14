import Link from "next/link";
import { and, count, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { formatDistanceToNow } from "date-fns";
import {
  Zap,
  Flame,
  MessageSquareText,
  Receipt,
  Users,
  TrendingUp,
  FileText,
  ChevronRight,
  Megaphone,
  CalendarClock,
} from "lucide-react";
import { db } from "@/db";
import { activities, clientServices, clients, conversations, invoices, messages, proposals, sequenceEnrollments } from "@/db/schema";
import { requireAdmin } from "@/lib/session";
import { money } from "@/lib/utils";
import { Avatar, Badge, Card, CardHeader, EmptyState, LinkButton } from "@/components/ui";
import { statusTone } from "@/lib/status";
import { ActivityChart } from "@/components/dashboard/activity-chart";

export const metadata = { title: "Dashboard" };

const DAY = 86_400_000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY);

export default async function DashboardPage(props: PageProps<"/dashboard">) {
  const session = await requireAdmin();
  const { range = "30" } = (await props.searchParams) as { range?: string };
  const days = [7, 30, 90].includes(Number(range)) ? Number(range) : 30;
  const since = daysAgo(days);

  const [
    [{ activeClients }],
    [{ mrr }],
    [{ outstanding, overdue }],
    [{ pipeline, openProposals }],
    [{ unread }],
    [{ sent }],
    [{ received }],
    [{ followups }],
    series,
    latestReplies,
    hotLeads,
    renewals,
    recent,
  ] = await Promise.all([
    db.select({ activeClients: count() }).from(clients).where(eq(clients.status, "active")),
    db
      .select({
        mrr: sql<number>`coalesce(sum(case ${clientServices.interval} when 'month' then ${clientServices.price} when 'year' then ${clientServices.price} / 12 else 0 end), 0)::int`,
      })
      .from(clientServices)
      .where(eq(clientServices.status, "active")),
    db
      .select({
        outstanding: sql<number>`coalesce(sum(${invoices.amountDue} - ${invoices.amountPaid}), 0)::int`,
        overdue: sql<number>`coalesce(sum(case when ${invoices.dueDate} < now() then ${invoices.amountDue} - ${invoices.amountPaid} else 0 end), 0)::int`,
      })
      .from(invoices)
      .where(eq(invoices.status, "open")),
    db
      .select({ pipeline: sql<number>`coalesce(sum(${proposals.amount}), 0)::int`, openProposals: count() })
      .from(proposals)
      .where(inArray(proposals.status, ["sent", "viewed"])),
    db.select({ unread: count() }).from(conversations).where(eq(conversations.unread, true)),
    db
      .select({ sent: count() })
      .from(messages)
      .where(and(eq(messages.direction, "out"), eq(messages.channel, "email"), gte(messages.createdAt, since))),
    db.select({ received: count() }).from(messages).where(and(eq(messages.direction, "in"), gte(messages.createdAt, since))),
    db.select({ followups: count() }).from(sequenceEnrollments).where(eq(sequenceEnrollments.status, "active")),
    db.execute<{ day: string; sent: number; received: number; clients: number }>(sql`
      with days as (
        select generate_series(date_trunc('day', ${since.toISOString()}::timestamptz), date_trunc('day', now()), interval '1 day') as day
      )
      select to_char(d.day, 'YYYY-MM-DD') as day,
        (select count(*)::int from ${messages} m where m.direction = 'out' and m.channel = 'email' and date_trunc('day', m.created_at) = d.day) as sent,
        (select count(*)::int from ${messages} m where m.direction = 'in' and date_trunc('day', m.created_at) = d.day) as received,
        (select count(*)::int from ${clients} c where date_trunc('day', c.created_at) = d.day) as clients
      from days d order by d.day`),
    db.query.conversations.findMany({
      where: eq(conversations.lastMessageDirection, "in"),
      orderBy: desc(conversations.lastMessageAt),
      limit: 5,
      with: { client: true },
    }),
    db.query.clients.findMany({
      where: and(inArray(clients.status, ["lead", "prospect"]), isNotNull(clients.lastRepliedAt)),
      orderBy: desc(clients.lastRepliedAt),
      limit: 5,
    }),
    db.query.clientServices.findMany({
      where: and(eq(clientServices.status, "active"), isNotNull(clientServices.renewalDate), gte(clientServices.renewalDate, new Date())),
      orderBy: clientServices.renewalDate,
      limit: 5,
      with: { client: true },
    }),
    db.query.activities.findMany({ orderBy: desc(activities.createdAt), limit: 8 }),
  ]);

  const rows = ("rows" in series ? series.rows : series) as { day: string; sent: number; received: number; clients: number }[];
  const replyRate = sent ? Math.round((received / sent) * 100) : 0;
  const nextActions = unread + (overdue > 0 ? 1 : 0);

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
        <h1 className="text-3xl font-bold tracking-tight">Welcome {session.user.name.split(" ")[0]} 🚀</h1>
        <div className="flex gap-1.5">
          {[7, 30, 90].map((d) => (
            <Link
              key={d}
              href={`/dashboard?range=${d}`}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${d === days ? "bg-foreground text-background" : "bg-black/[.04] text-foreground hover:bg-black/[.07]"}`}
            >
              {d === 90 ? "3 months" : `${d} days`}
            </Link>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_2fr_1fr]">
        <Card className="p-5">
          <div className="flex items-start gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-lg bg-brand-50 text-brand">
              <Zap className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="font-semibold">Next actions</p>
              <p className="text-xs text-muted">Things waiting on you</p>
            </div>
            <p className="text-3xl font-bold">{nextActions}</p>
          </div>
          <div className="mt-4 space-y-2 border-t border-border pt-3 text-[13px]">
            <Link href="/inbox?f=unread" className="flex items-center justify-between hover:text-brand">
              <span className="flex items-center gap-2"><MessageSquareText className="h-4 w-4 text-green-600" /> Unread replies</span>
              <b>{unread}</b>
            </Link>
            <Link href="/invoices?status=overdue" className="flex items-center justify-between hover:text-brand">
              <span className="flex items-center gap-2"><Receipt className="h-4 w-4 text-danger" /> Overdue</span>
              <b>{money(overdue)}</b>
            </Link>
            <Link href="/automations" className="flex items-center justify-between hover:text-brand">
              <span className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-purple-600" /> Active follow-ups</span>
              <b>{followups}</b>
            </Link>
          </div>
        </Card>
        <Card className="grid grid-cols-2 divide-border sm:grid-cols-3 sm:divide-x">
          <Metric label="Monthly recurring" value={money(mrr)} sub={`${activeClients} active clients`} />
          <Metric label="Open pipeline" value={money(pipeline)} sub={`${openProposals} proposals out`} />
          <Metric label="Reply rate" value={`${replyRate}%`} sub={`${received} replies / ${sent} sent`} />
        </Card>
        <Card className="flex flex-col justify-center p-5">
          <p className="text-[13px] text-muted">Outstanding invoices</p>
          <p className="mt-1 text-3xl font-bold tracking-tight">{money(outstanding)}</p>
          <p className="mt-1 text-xs text-muted">{overdue > 0 ? <span className="text-danger">{money(overdue)} overdue</span> : "Nothing overdue"}</p>
        </Card>
      </div>

      <Card className="p-5">
        <div className="mb-2">
          <h2 className="text-lg font-semibold">Activity overview</h2>
          <p className="text-[13px] text-muted">Your outreach and client growth</p>
        </div>
        <ActivityChart data={rows} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            icon={<MessageSquareText className="h-5 w-5" />}
            title="Latest replies"
            description="Recent conversation responses"
            action={<Link href="/inbox" className="flex items-center text-sm font-medium text-info">View all <ChevronRight className="h-4 w-4" /></Link>}
          />
          {latestReplies.length ? (
            <ul className="divide-y divide-border">
              {latestReplies.map((c) => (
                <li key={c.id}>
                  <Link href={`/inbox?c=${c.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-surface-2">
                    <Avatar name={c.client.name} size={36} />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 text-sm font-semibold">
                        {c.client.name} {c.unread && <span className="h-2 w-2 rounded-full bg-brand" />}
                      </p>
                      <p className="truncate text-[13px] text-muted">{c.lastMessagePreview}</p>
                    </div>
                    <span className="shrink-0 text-xs text-muted">{formatDistanceToNow(c.lastMessageAt, { addSuffix: true })}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={<MessageSquareText className="h-5 w-5" />} title="No replies yet" description="Replies to your campaigns and follow-ups land here." action={<LinkButton href="/campaigns" variant="secondary" size="sm"><Megaphone className="h-4 w-4" /> Send a campaign</LinkButton>} />
          )}
        </Card>

        <Card>
          <CardHeader
            icon={<Flame className="h-5 w-5" />}
            title="Hot leads"
            description="Leads & prospects who replied recently"
            action={<Link href="/clients?status=prospect" className="flex items-center text-sm font-medium text-info">View more <ChevronRight className="h-4 w-4" /></Link>}
          />
          {hotLeads.length ? (
            <ul className="divide-y divide-border">
              {hotLeads.map((c) => (
                <li key={c.id}>
                  <Link href={`/clients/${c.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-surface-2">
                    <Avatar name={c.name} size={36} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-info">{c.name}</p>
                      <p className="truncate text-[13px] text-muted">{c.company ?? c.email}</p>
                    </div>
                    <Badge tone={statusTone(c.status)}>{c.status}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={<Flame className="h-5 w-5" />} title="No hot leads yet" description="When a lead or prospect replies, they show up here." />
          )}
        </Card>

        <Card>
          <CardHeader icon={<TrendingUp className="h-5 w-5" />} title="Upcoming renewals" description="Active services renewing soon" />
          {renewals.length ? (
            <ul className="divide-y divide-border">
              {renewals.map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-5 py-3">
                  <Avatar name={s.client.name} size={32} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{s.name}</p>
                    <Link href={`/clients/${s.clientId}`} className="text-[13px] text-muted hover:text-brand">{s.client.name}</Link>
                  </div>
                  <div className="text-right text-[13px]">
                    <p className="font-semibold">{money(s.price, s.currency)}</p>
                    <p className="text-muted">{s.renewalDate!.toLocaleDateString()}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={<TrendingUp className="h-5 w-5" />} title="No upcoming renewals" description="Set renewal dates on client services to see them here." />
          )}
        </Card>

        <Card>
          <CardHeader icon={<Users className="h-5 w-5" />} title="Recent activity" />
          {recent.length ? (
            <ul className="divide-y divide-border">
              {recent.map((a) => (
                <li key={a.id} className="flex items-start gap-3 px-5 py-3 text-sm">
                  <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
                  <div className="min-w-0 flex-1">
                    {a.clientId ? <Link href={`/clients/${a.clientId}`} className="hover:text-brand">{a.summary}</Link> : a.summary}
                  </div>
                  <span className="shrink-0 text-xs text-muted">{formatDistanceToNow(a.createdAt, { addSuffix: true })}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Nothing yet" description="Add your first client to get started." action={<LinkButton href="/clients" size="sm">Add clients</LinkButton>} />
          )}
        </Card>
      </div>
    </div>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="p-5">
      <p className="text-[13px] text-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold tracking-tight">{value}</p>
      <p className="mt-1 text-xs text-muted">{sub}</p>
    </div>
  );
}
