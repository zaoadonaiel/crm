import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db";
import { clients, proposals } from "@/db/schema";
import { requireAdmin } from "@/lib/session";
import { appUrl } from "@/lib/utils";
import { ProposalEditor } from "./editor";

export const metadata = { title: "Edit proposal" };

export default async function ProposalPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const [p, clientList] = await Promise.all([
    db.query.proposals.findFirst({ where: eq(proposals.id, id), with: { client: { columns: { id: true, name: true, email: true } } } }),
    db.select({ id: clients.id, name: clients.name, company: clients.company }).from(clients).orderBy(asc(clients.name)),
  ]);
  if (!p) notFound();

  return (
    <div>
      <div className="border-b border-border bg-surface px-4 py-3 sm:px-6">
        <Link href="/proposals" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> All proposals
        </Link>
      </div>
      <ProposalEditor
        proposal={{
          id: p.id,
          title: p.title,
          clientId: p.clientId,
          clientName: p.client.name,
          clientEmail: p.client.email,
          amount: p.amount,
          currency: p.currency,
          body: p.body,
          status: p.status,
          autoFollowUp: p.autoFollowUp,
          sentAt: p.sentAt?.toISOString() ?? null,
          viewedAt: p.viewedAt?.toISOString() ?? null,
          respondedAt: p.respondedAt?.toISOString() ?? null,
          createdAt: p.createdAt.toISOString(),
          publicUrl: appUrl(`/p/${p.token}`),
        }}
        clients={clientList}
      />
    </div>
  );
}
