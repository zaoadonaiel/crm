import Link from "next/link";
import { and, count, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { Users } from "lucide-react";
import { db } from "@/db";
import { CLIENT_STATUSES, clientServices, clients, invoices, type ClientStatus } from "@/db/schema";
import { requireAdmin } from "@/lib/session";
import { Card, PageHeader } from "@/components/ui";
import { cn } from "@/lib/utils";
import { ClientFilters, ClientsHeaderActions, ClientsTable, type ClientRow } from "./clients-table";

export const metadata = { title: "Clients" };

const PAGE_SIZE = 25;
const TABS: { key: "all" | ClientStatus; label: string }[] = [
  { key: "all", label: "All" },
  { key: "lead", label: "Leads" },
  { key: "prospect", label: "Prospects" },
  { key: "active", label: "Active" },
  { key: "past", label: "Past" },
];

type SP = { q?: string; status?: string; tag?: string; page?: string };

function href(sp: SP, patch: Partial<SP>) {
  const next = { ...sp, ...patch };
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(next)) if (v && !(k === "page" && v === "1") && !(k === "status" && v === "all")) qs.set(k, v);
  const s = qs.toString();
  return `/clients${s ? `?${s}` : ""}`;
}

export default async function ClientsPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdmin();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const status = CLIENT_STATUSES.includes(sp.status as ClientStatus) ? (sp.status as ClientStatus) : "all";
  const tag = (sp.tag ?? "").trim();
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);

  const base: SQL[] = [];
  if (q) {
    const like = `%${q.replace(/[%_\\]/g, "\\$&")}%`;
    base.push(or(ilike(clients.name, like), ilike(clients.email, like), ilike(clients.company, like))!);
  }
  if (tag) base.push(sql`${clients.tags} @> ${JSON.stringify([tag])}::jsonb`);
  const where = and(...base, status !== "all" ? eq(clients.status, status) : undefined);

  const [rows, [{ total }], statusCounts, tagRows] = await Promise.all([
    db
      .select()
      .from(clients)
      .where(where)
      .orderBy(desc(clients.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: count() }).from(clients).where(where),
    db
      .select({ status: clients.status, n: count() })
      .from(clients)
      .where(and(...base))
      .groupBy(clients.status),
    db.selectDistinct({ tag: sql<string>`jsonb_array_elements_text(${clients.tags})`.as("tag") }).from(clients).orderBy(sql`1`),
  ]);

  const ids = rows.map((r) => r.id);
  const [svcCounts, balances] = ids.length
    ? await Promise.all([
        db
          .select({ clientId: clientServices.clientId, n: count() })
          .from(clientServices)
          .where(and(inArray(clientServices.clientId, ids), eq(clientServices.status, "active")))
          .groupBy(clientServices.clientId),
        db
          .select({
            clientId: invoices.clientId,
            balance: sql<number>`coalesce(sum(${invoices.amountDue} - ${invoices.amountPaid}), 0)::int`,
          })
          .from(invoices)
          .where(and(inArray(invoices.clientId, ids), eq(invoices.status, "open")))
          .groupBy(invoices.clientId),
      ])
    : [[], []];

  const svcMap = new Map(svcCounts.map((s) => [s.clientId, s.n]));
  const balMap = new Map(balances.map((b) => [b.clientId, b.balance]));
  const data: ClientRow[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    company: r.company,
    status: r.status,
    tags: r.tags,
    services: svcMap.get(r.id) ?? 0,
    balance: balMap.get(r.id) ?? 0,
    lastContactedAt: r.lastContactedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    portal: !!r.userId,
  }));

  const counts: Record<string, number> = { all: 0 };
  for (const s of statusCounts) {
    counts[s.status] = s.n;
    counts.all += s.n;
  }
  const allTags = tagRows.map((t) => t.tag);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <PageHeader
        title="Clients"
        description="Everyone you work with — leads, prospects and paying clients."
        icon={<Users className="h-5 w-5" />}
        actions={<ClientsHeaderActions />}
      />
      <div className="space-y-4 p-4 sm:p-6">
        <nav aria-label="Filter by status" className="flex gap-1 overflow-x-auto border-b border-border">
          {TABS.map((t) => {
            const active = status === t.key;
            return (
              <Link
                key={t.key}
                href={href(sp, { status: t.key, page: "1" })}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition-colors",
                  active ? "border-brand font-semibold text-foreground" : "border-transparent text-muted hover:text-foreground",
                )}
              >
                {t.label}
                <span className={cn("rounded-full px-1.5 text-[11px] font-semibold", active ? "bg-brand-50 text-brand-600" : "bg-black/5 text-muted")}>
                  {counts[t.key] ?? 0}
                </span>
              </Link>
            );
          })}
        </nav>

        <Card className="overflow-hidden">
          <ClientFilters q={q} tag={tag} status={status} tags={allTags} />
          <ClientsTable rows={data} allTags={allTags} filtered={!!(q || tag || status !== "all")} />
          {total > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm text-muted">
              <span>
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
              </span>
              <div className="flex items-center gap-1">
                <PageLink disabled={page <= 1} href={href(sp, { page: String(page - 1) })}>
                  Previous
                </PageLink>
                <span className="px-2">
                  Page {page} of {pages}
                </span>
                <PageLink disabled={page >= pages} href={href(sp, { page: String(page + 1) })}>
                  Next
                </PageLink>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function PageLink({ href, disabled, children }: { href: string; disabled?: boolean; children: React.ReactNode }) {
  if (disabled)
    return (
      <span aria-disabled className="rounded-lg border border-border px-3 py-1.5 opacity-40">
        {children}
      </span>
    );
  return (
    <Link href={href} className="rounded-lg border border-border bg-surface px-3 py-1.5 text-foreground hover:bg-surface-2">
      {children}
    </Link>
  );
}
