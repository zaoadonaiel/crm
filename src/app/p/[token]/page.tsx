import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { CheckCircle2, XCircle } from "lucide-react";
import { db } from "@/db";
import { proposals } from "@/db/schema";
import { getSession } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { logActivity } from "@/lib/conversations";
import { money } from "@/lib/utils";
import { fmtDate } from "@/lib/billing/format";
import { markdownClass, renderMarkdown } from "@/lib/markdown";
import { Logo } from "@/components/admin/sidebar";
import { RespondPanel } from "./respond";

type Props = { params: Promise<{ token: string }> };

async function load(token: string) {
  if (!token || token.length < 10) return null;
  return db.query.proposals.findFirst({
    where: eq(proposals.token, token),
    with: { client: { columns: { id: true, name: true, company: true } } },
  });
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const p = await load(token);
  return { title: p ? p.title : "Proposal", robots: { index: false, follow: false } };
}

export default async function PublicProposalPage({ params }: Props) {
  const { token } = await params;
  const [p, s, session] = await Promise.all([load(token), getSettings(), getSession().catch(() => null)]);
  if (!p || p.status === "draft") {
    // Admins can preview drafts; everyone else gets a 404.
    if (!p || (session?.user as { role?: string } | undefined)?.role !== "admin") notFound();
  }
  const isAdmin = (session?.user as { role?: string } | undefined)?.role === "admin";

  // First open by the client → mark viewed (admins previewing don't count).
  if (!isAdmin && p.status === "sent") {
    const updated = await db
      .update(proposals)
      .set({ status: "viewed", viewedAt: new Date() })
      .where(and(eq(proposals.id, p.id), eq(proposals.status, "sent")))
      .returning({ id: proposals.id });
    if (updated.length) {
      await logActivity(p.clientId, "proposal.viewed", `Viewed proposal “${p.title}”`, { proposalId: p.id });
      p.status = "viewed";
    }
  }

  const html = renderMarkdown(p.body);
  const amount = money(p.amount, p.currency);
  const brand = s.brandColor || "#f26b4e";

  return (
    <div className="min-h-screen bg-background" style={{ ["--brand" as string]: brand }}>
      {isAdmin && (
        <div className="bg-foreground px-4 py-2 text-center text-xs text-background">
          Preview mode — you’re signed in as an admin, so views and responses aren’t recorded from this page.
        </div>
      )}
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-2">
            {s.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={s.logoUrl} alt={s.businessName} className="h-8 w-auto dark:rounded-lg dark:bg-white dark:p-1.5 dark:box-content" />
            ) : (
              <>
                <Logo size={26} />
                <span className="text-lg font-bold tracking-tight">{s.businessName}</span>
              </>
            )}
          </div>
          <span className="text-xs text-muted">Proposal</span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <article className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
          <div className="border-b border-border bg-gradient-to-br from-brand-50 via-surface to-surface px-6 py-10 sm:px-12">
            <p className="text-sm font-medium text-brand">Prepared for {p.client.company || p.client.name}</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{p.title}</h1>
            <p className="mt-3 text-sm text-muted">
              From {s.businessName}
              {p.sentAt ? ` · ${fmtDate(p.sentAt, { month: "long", day: "numeric", year: "numeric" })}` : ""}
            </p>
          </div>

          <div className="px-6 py-8 sm:px-12 sm:py-10">
            {p.body.trim() ? <div className={markdownClass} dangerouslySetInnerHTML={{ __html: html }} /> : null}

            <div className="mt-10 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-brand-100 bg-brand-50 px-6 py-5">
              <span className="font-medium">Total investment</span>
              <span className="text-2xl font-bold tracking-tight">{amount}</span>
            </div>
          </div>

          <div className="border-t border-border bg-surface-2 px-6 py-8 sm:px-12">
            {p.status === "accepted" ? (
              <div className="flex items-start gap-3" role="status">
                <CheckCircle2 className="h-6 w-6 shrink-0 text-green-600" />
                <div>
                  <p className="font-semibold">Accepted{p.respondedAt ? ` on ${fmtDate(p.respondedAt, { month: "long", day: "numeric", year: "numeric" })}` : ""}</p>
                  <p className="text-sm text-muted">Thank you! We’ll be in touch shortly with next steps.</p>
                </div>
              </div>
            ) : p.status === "declined" ? (
              <div className="flex items-start gap-3" role="status">
                <XCircle className="h-6 w-6 shrink-0 text-muted" />
                <div>
                  <p className="font-semibold">Declined</p>
                  <p className="text-sm text-muted">Thanks for letting us know. If anything changes, just reply to our email.</p>
                </div>
              </div>
            ) : isAdmin ? (
              <p className="text-sm text-muted">The client will see Accept / Decline buttons here.</p>
            ) : (
              <RespondPanel token={token} clientName={p.client.name} amount={amount} />
            )}
          </div>
        </article>
        <p className="mt-6 text-center text-xs text-muted">
          {s.businessName}
          {s.address ? ` · ${s.address}` : ""}
        </p>
      </main>
    </div>
  );
}
