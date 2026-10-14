import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq, sql } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db";
import { clients, sequenceEnrollments, sequences } from "@/db/schema";
import { requireAdmin } from "@/lib/session";
import { SequenceEditor } from "@/components/automations/sequence-editor";
import { EnrollmentsTable, type EnrollmentRow } from "@/components/automations/enrollments";

export const metadata = { title: "Edit sequence" };

export default async function SequencePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const seq = await db.query.sequences.findFirst({ where: eq(sequences.id, id) });
  if (!seq) notFound();

  const rows = await db
    .select({
      id: sequenceEnrollments.id,
      status: sequenceEnrollments.status,
      stopReason: sequenceEnrollments.stopReason,
      currentStep: sequenceEnrollments.currentStep,
      nextRunAt: sequenceEnrollments.nextRunAt,
      refType: sequenceEnrollments.refType,
      conversationId: sequenceEnrollments.conversationId,
      createdAt: sequenceEnrollments.createdAt,
      updatedAt: sequenceEnrollments.updatedAt,
      client: { id: clients.id, name: clients.name, email: clients.email, company: clients.company },
    })
    .from(sequenceEnrollments)
    .innerJoin(clients, eq(clients.id, sequenceEnrollments.clientId))
    .where(eq(sequenceEnrollments.sequenceId, seq.id))
    .orderBy(
      sql`case ${sequenceEnrollments.status} when 'active' then 0 else 1 end`,
      asc(sequenceEnrollments.nextRunAt),
      desc(sequenceEnrollments.updatedAt),
    )
    .limit(500);

  return (
    <div>
      <div className="border-b border-border bg-surface px-4 py-3 sm:px-6">
        <Link href="/automations" className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> All sequences
        </Link>
      </div>
      <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
        <SequenceEditor
          sequence={{
            id: seq.id,
            name: seq.name,
            trigger: seq.trigger,
            stopOnReply: seq.stopOnReply,
            active: seq.active,
            steps: seq.steps,
          }}
          activeEnrollments={rows.filter((r) => r.status === "active").length}
        />
        <EnrollmentsTable sequenceId={seq.id} sequenceActive={seq.active} trigger={seq.trigger} stepCount={seq.steps.length} rows={rows as EnrollmentRow[]} />
      </div>
    </div>
  );
}
