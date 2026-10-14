import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { sequenceEnrollments, sequences } from "@/db/schema";

const DAY = 86_400_000;

/**
 * Enroll a client in every active sequence with the given trigger
 * (e.g. "proposal_sent" when you send a proposal). Skips duplicates for the same ref.
 */
export async function enrollForTrigger(
  trigger: "proposal_sent" | "invoice_sent",
  clientId: string,
  ref: { type: "proposal" | "invoice"; id: string },
) {
  const seqs = await db.query.sequences.findMany({ where: and(eq(sequences.trigger, trigger), eq(sequences.active, true)) });
  for (const s of seqs) await enrollInSequence(s.id, clientId, ref);
}

export async function enrollInSequence(
  sequenceId: string,
  clientId: string,
  ref: { type: "proposal" | "invoice" | "manual"; id?: string } = { type: "manual" },
) {
  const seq = await db.query.sequences.findFirst({ where: eq(sequences.id, sequenceId) });
  if (!seq || !seq.steps.length) return null;
  const existing = await db.query.sequenceEnrollments.findFirst({
    where: and(
      eq(sequenceEnrollments.sequenceId, sequenceId),
      eq(sequenceEnrollments.clientId, clientId),
      eq(sequenceEnrollments.status, "active"),
    ),
  });
  if (existing) return existing;
  const [e] = await db
    .insert(sequenceEnrollments)
    .values({
      sequenceId,
      clientId,
      refType: ref.type,
      refId: ref.id,
      currentStep: 0,
      nextRunAt: new Date(Date.now() + seq.steps[0]!.delayDays * DAY),
    })
    .returning();
  return e!;
}

/** Stop enrollments tied to a ref (e.g. proposal accepted, invoice paid). */
export async function stopEnrollmentsForRef(refId: string, reason: string) {
  await db
    .update(sequenceEnrollments)
    .set({ status: "stopped", stopReason: reason, nextRunAt: null })
    .where(and(eq(sequenceEnrollments.refId, refId), eq(sequenceEnrollments.status, "active")));
}
