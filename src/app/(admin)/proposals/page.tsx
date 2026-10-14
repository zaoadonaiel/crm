import Link from "next/link";
import { asc, desc } from "drizzle-orm";
import { FileText, CircleDollarSign, Trophy, Percent, PenLine } from "lucide-react";
import { db } from "@/db";
import { PROPOSAL_STATUSES, clients, proposals, type ProposalStatus } from "@/db/schema";
import { requireAdmin } from "@/lib/session";
import { Avatar, Badge, Card, EmptyState, PageHeader, Stat } from "@/components/ui";
import { statusTone } from "@/lib/status";
import { cn, money } from "@/lib/utils";
import { fmtDate } from "@/lib/billing/format";
import { NewProposalButton } from "./new-proposal";

export const metadata = { title: "Proposals" };

export default async function ProposalsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const filter = PROPOSAL_STATUSES.includes(sp.status as ProposalStatus) ? (sp.status as ProposalStatus) : null;

  const [all, clientList] = await Promise.all([
    db.query.proposals.findMany({
      with: { client: { columns: { id: true, name: true, company: true } } },
      orderBy: desc(proposals.createdAt),
    }),
    db.select({ id: clients.id, name: clients.name, company: clients.company }).from(clients).orderBy(asc(clients.name)),
  ]);

  const sum = (s: ProposalStatus[]) => all.filter((p) => s.includes(p.status)).reduce((a, p) => a + p.amount, 0);
  const open = all.filter((p) => p.status === "sent" || p.status === "viewed");
  const won = all.filter((p) => p.status === "accepted");
  const decided = won.length + all.filter((p) => p.status === "declined").length;
  const winRate = decided ? Math.round((won.length / decided) * 100) : null;
  const rows = filter ? all.filter((p) => p.status === filter) : all;

  const counts: Record<string, number> = { all: all.length };
  for (const p of all) counts[p.status] = (counts[p.status] ?? 0) + 1;

  return (
    <div>
      <PageHeader
        title="Proposals"
        description="Send beautiful proposals clients can accept online."
        icon={<FileText className="h-5 w-5" />}
        actions={<NewProposalButton clients={clientList} />}
      />
      <div className="space-y-6 p-4 sm:p-6">
        <Card className="grid grid-cols-1 divide-y divide-border sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x">
          <Stat label="Open pipeline" value={money(sum(["sent", "viewed"]))} sub={`${open.length} awaiting a response`} icon={<CircleDollarSign className="h-5 w-5" />} />
          <Stat label="Won" value={money(sum(["accepted"]))} sub={`${won.length} accepted`} icon={<Trophy className="h-5 w-5" />} />
          <Stat label="Win rate" value={winRate === null ? "—" : `${winRate}%`} sub={`${decided} decided`} icon={<Percent className="h-5 w-5" />} />
          <Stat label="Drafts" value={String(counts.draft ?? 0)} sub={money(sum(["draft"]))} icon={<PenLine className="h-5 w-5" />} />
        </Card>

        <nav aria-label="Filter by status" className="flex gap-1 overflow-x-auto border-b border-border">
          {(["all", ...PROPOSAL_STATUSES] as const).map((s) => {
            const active = (filter ?? "all") === s;
            return (
              <Link
                key={s}
                href={s === "all" ? "/proposals" : `/proposals?status=${s}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm capitalize",
                  active ? "border-brand font-semibold" : "border-transparent text-muted hover:text-foreground",
                )}
              >
                {s}
                <span className="rounded-full bg-black/5 px-1.5 text-[11px] font-semibold text-muted">{counts[s] ?? 0}</span>
              </Link>
            );
          })}
        </nav>

        <Card className="overflow-hidden">
          {rows.length === 0 ? (
            <EmptyState
              icon={<FileText className="h-5 w-5" />}
              title={filter ? `No ${filter} proposals` : "No proposals yet"}
              description="Create a proposal, send it, and get notified the moment it's viewed or accepted."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="bg-surface-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                    <th className="border-b border-border px-4 py-3">Proposal</th>
                    <th className="border-b border-border px-4 py-3">Client</th>
                    <th className="border-b border-border px-4 py-3">Status</th>
                    <th className="border-b border-border px-4 py-3 text-right">Amount</th>
                    <th className="border-b border-border px-4 py-3">Sent</th>
                    <th className="border-b border-border px-4 py-3">Viewed</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => (
                    <tr key={p.id} className="group hover:bg-surface-2">
                      <td className="border-b border-border px-4 py-3">
                        <Link href={`/proposals/${p.id}`} className="font-semibold group-hover:text-brand">
                          {p.title}
                        </Link>
                        {p.autoFollowUp && p.status !== "draft" && p.status !== "accepted" && p.status !== "declined" && (
                          <span className="ml-2 text-[11px] text-muted">· auto follow-up</span>
                        )}
                      </td>
                      <td className="border-b border-border px-4 py-3">
                        <Link href={`/clients/${p.client.id}`} className="flex items-center gap-2 hover:text-brand">
                          <Avatar name={p.client.name} size={26} />
                          <span className="truncate">{p.client.company || p.client.name}</span>
                        </Link>
                      </td>
                      <td className="border-b border-border px-4 py-3">
                        <Badge tone={statusTone(p.status)}>{p.status}</Badge>
                      </td>
                      <td className="border-b border-border px-4 py-3 text-right font-semibold tabular-nums">{money(p.amount, p.currency)}</td>
                      <td className="border-b border-border px-4 py-3 text-muted">{p.sentAt ? fmtDate(p.sentAt) : "—"}</td>
                      <td className="border-b border-border px-4 py-3 text-muted">{p.viewedAt ? fmtDate(p.viewedAt) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
