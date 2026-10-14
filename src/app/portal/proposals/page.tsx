import Link from "next/link";
import { and, desc, eq, ne } from "drizzle-orm";
import { ArrowRight, FileText } from "lucide-react";
import { db } from "@/db";
import { proposals } from "@/db/schema";
import { requireClient } from "@/lib/session";
import { Badge, Card, EmptyState } from "@/components/ui";
import { statusTone } from "@/lib/status";
import { money } from "@/lib/utils";
import { fmtDate } from "@/lib/billing/format";

export const metadata = { title: "Proposals" };

const LABEL: Record<string, string> = { sent: "awaiting response", viewed: "awaiting response", accepted: "accepted", declined: "declined" };

export default async function PortalProposals() {
  const { client } = await requireClient();
  if (!client) return null;
  const rows = await db.query.proposals.findMany({
    where: and(eq(proposals.clientId, client.id), ne(proposals.status, "draft")),
    orderBy: desc(proposals.sentAt),
    columns: { id: true, title: true, amount: true, currency: true, status: true, token: true, sentAt: true, respondedAt: true },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Proposals</h1>
        <p className="mt-1 text-sm text-muted">Review and respond to proposals we’ve sent you.</p>
      </div>
      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState icon={<FileText className="h-5 w-5" />} title="No proposals yet" description="Proposals we send you will appear here." />
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((p) => {
              const pending = p.status === "sent" || p.status === "viewed";
              return (
                <li key={p.id}>
                  <Link href={`/p/${p.token}`} className="group flex flex-wrap items-center gap-4 px-5 py-4 hover:bg-surface-2">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand">
                      <FileText className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold group-hover:text-brand">{p.title}</p>
                      <p className="text-sm text-muted">
                        {p.sentAt ? `Sent ${fmtDate(p.sentAt)}` : ""}
                        {p.respondedAt ? ` · ${p.status === "accepted" ? "Accepted" : "Declined"} ${fmtDate(p.respondedAt)}` : ""}
                      </p>
                    </div>
                    <span className="font-bold tabular-nums">{money(p.amount, p.currency)}</span>
                    <Badge tone={pending ? "brand" : statusTone(p.status)}>{LABEL[p.status] ?? p.status}</Badge>
                    <ArrowRight className="h-4 w-4 text-muted group-hover:text-brand" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
