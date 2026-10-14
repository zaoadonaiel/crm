"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { db } from "@/db";
import { clients, SEQUENCE_TRIGGERS, sequenceEnrollments, sequences, suppressions } from "@/db/schema";
import { enrollInSequence } from "@/lib/automations/enroll";
import { processDueEnrollments, type RunSummary } from "@/lib/automations/run";
import { logActivity } from "@/lib/conversations";
import { assertAdmin } from "@/lib/session";

type Result<T = undefined> = ({ ok: true } & (T extends undefined ? unknown : { data: T })) | { ok: false; error: string };

function fail(err: unknown): { ok: false; error: string } {
  if (err instanceof z.ZodError) return { ok: false, error: err.issues[0]?.message ?? "Invalid input" };
  console.error("[automations]", err);
  return { ok: false, error: err instanceof Error ? err.message : "Something went wrong" };
}

function revalidate(id?: string) {
  revalidatePath("/automations");
  if (id) revalidatePath(`/automations/${id}`);
}

const id = z.string().min(1).max(64);
const trigger = z.enum(SEQUENCE_TRIGGERS);

const stepSchema = z.object({
  id: z.string().min(1).max(40),
  delayDays: z.coerce.number().int().min(0, "Delay can't be negative").max(365, "Delay must be under a year"),
  subject: z.string().trim().max(300),
  body: z.string().trim().min(1, "Every step needs a message").max(20_000),
});

const sequenceSchema = z.object({
  name: z.string().trim().min(1, "Give the sequence a name").max(120),
  trigger,
  stopOnReply: z.boolean(),
  active: z.boolean().optional(),
  steps: z
    .array(stepSchema)
    .min(1, "Add at least one step")
    .max(20, "Keep sequences to 20 steps or fewer")
    .refine((s) => !!s[0]?.subject, { message: "The first step needs a subject" }),
});

export async function createSequence(formData: FormData) {
  await assertAdmin();
  const name = z.string().trim().min(1).max(120).catch("Untitled sequence").parse(formData.get("name"));
  const t = trigger.catch("manual").parse(formData.get("trigger"));
  const [seq] = await db
    .insert(sequences)
    .values({
      name,
      trigger: t,
      active: false,
      stopOnReply: true,
      steps: [
        {
          id: nanoid(10),
          delayDays: t === "manual" ? 0 : 3,
          subject: t === "invoice_sent" ? "Invoice {{invoice_number}} — friendly reminder" : "Quick follow-up",
          body: "Hi {{first_name}},\n\n",
        },
      ],
    })
    .returning({ id: sequences.id });
  revalidate();
  redirect(`/automations/${seq!.id}`);
}

export async function saveSequence(sequenceId: string, input: z.input<typeof sequenceSchema>): Promise<Result> {
  try {
    await assertAdmin();
    const data = sequenceSchema.parse(input);
    await db.update(sequences).set(data).where(eq(sequences.id, id.parse(sequenceId)));
    revalidate(sequenceId);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function setSequenceActive(sequenceId: string, active: boolean): Promise<Result> {
  try {
    await assertAdmin();
    const seq = await db.query.sequences.findFirst({ where: eq(sequences.id, id.parse(sequenceId)) });
    if (!seq) return { ok: false, error: "Sequence not found" };
    if (active && !seq.steps.length) return { ok: false, error: "Add at least one step before activating" };
    await db.update(sequences).set({ active: !!active }).where(eq(sequences.id, seq.id));
    revalidate(sequenceId);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteSequence(sequenceId: string) {
  await assertAdmin();
  await db.delete(sequences).where(eq(sequences.id, id.parse(sequenceId)));
  revalidate();
  redirect("/automations");
}

export async function stopEnrollment(enrollmentId: string): Promise<Result> {
  try {
    await assertAdmin();
    const [e] = await db
      .update(sequenceEnrollments)
      .set({ status: "stopped", stopReason: "manual", nextRunAt: null })
      .where(and(eq(sequenceEnrollments.id, id.parse(enrollmentId)), eq(sequenceEnrollments.status, "active")))
      .returning();
    if (e) {
      const seq = await db.query.sequences.findFirst({ where: eq(sequences.id, e.sequenceId), columns: { name: true } });
      await logActivity(e.clientId, "sequence.stopped", `Removed from “${seq?.name ?? "sequence"}”`, { enrollmentId: e.id });
      revalidate(e.sequenceId);
    }
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function enrollClients(
  sequenceId: string,
  clientIds: string[],
): Promise<Result<{ enrolled: number; alreadyActive: number; suppressed: number }>> {
  try {
    await assertAdmin();
    const ids = z.array(id).min(1, "Pick at least one client").max(500).parse(clientIds);
    const seq = await db.query.sequences.findFirst({ where: eq(sequences.id, id.parse(sequenceId)) });
    if (!seq) return { ok: false, error: "Sequence not found" };
    if (!seq.steps.length) return { ok: false, error: "Add at least one step first" };

    const [rows, active] = await Promise.all([
      db.select({ id: clients.id, email: clients.email }).from(clients).where(inArray(clients.id, ids)),
      db
        .select({ clientId: sequenceEnrollments.clientId })
        .from(sequenceEnrollments)
        .where(
          and(
            eq(sequenceEnrollments.sequenceId, seq.id),
            eq(sequenceEnrollments.status, "active"),
            inArray(sequenceEnrollments.clientId, ids),
          ),
        ),
    ]);
    const emails = rows.map((r) => r.email.toLowerCase());
    const suppressedRows = emails.length
      ? await db.select({ email: suppressions.email }).from(suppressions).where(inArray(suppressions.email, emails))
      : [];
    const suppressedSet = new Set(suppressedRows.map((s) => s.email));
    const activeSet = new Set(active.map((a) => a.clientId));

    let enrolled = 0;
    let suppressed = 0;
    for (const c of rows) {
      if (activeSet.has(c.id)) continue;
      if (suppressedSet.has(c.email.toLowerCase())) {
        suppressed++;
        continue;
      }
      const e = await enrollInSequence(seq.id, c.id, { type: "manual" });
      if (e) {
        enrolled++;
        await logActivity(c.id, "sequence.enrolled", `Enrolled in “${seq.name}”`, { sequenceId: seq.id, enrollmentId: e.id });
      }
    }
    revalidate(seq.id);
    return { ok: true, data: { enrolled, alreadyActive: activeSet.size, suppressed } };
  } catch (err) {
    return fail(err);
  }
}

export async function runDueNow(): Promise<Result<RunSummary>> {
  try {
    await assertAdmin();
    const summary = await processDueEnrollments();
    revalidatePath("/automations", "layout");
    return { ok: true, data: summary };
  } catch (err) {
    return fail(err);
  }
}
