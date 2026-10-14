/**
 * Follow-up sequence runner. Called every few minutes by the job scheduler
 * (see src/lib/jobs). Safe to run concurrently: each enrollment is claimed with
 * a conditional update before anything is sent.
 */
import { and, asc, eq, isNotNull, lte } from "drizzle-orm";
import { db } from "@/db";
import { clients, conversations, invoices, proposals, sequenceEnrollments, sequences, suppressions } from "@/db/schema";
import { createConversation, logActivity, sendConversationEmail } from "@/lib/conversations";
import { getSettings } from "@/lib/settings";
import { appUrl, firstName, mergeTags, money } from "@/lib/utils";

const DAY = 86_400_000;
/** How long a claimed enrollment is locked before another run may retry it. */
const CLAIM_MS = 10 * 60_000;
/** Back-off after a failed send. */
const RETRY_MS = 60 * 60_000;

type Enrollment = typeof sequenceEnrollments.$inferSelect;

export type RunSummary = { processed: number; sent: number; stopped: number; completed: number; failed: number };

/** Public link to a proposal (served by the proposals module). */
export function proposalUrl(token: string) {
  return appUrl(`/p/${token}`);
}

/** Replace only the given merge tags, leaving the rest for sendConversationEmail. */
function fillTags(template: string, vars: Record<string, string>) {
  return template.replace(/\{\{\s*([a-z_]+)(?:\s*\|\s*([^}]*))?\s*\}\}/gi, (m, key: string, fallback?: string) => {
    const k = key.toLowerCase();
    if (!(k in vars)) return m;
    const v = vars[k];
    return v && v.trim() ? v : (fallback?.trim() ?? "");
  });
}

type RefState = { resolved: string | null; vars: Record<string, string> };

async function loadRef(e: Enrollment): Promise<RefState> {
  if (e.refType === "proposal" && e.refId) {
    const p = await db.query.proposals.findFirst({ where: eq(proposals.id, e.refId) });
    if (!p) return { resolved: "proposal_deleted", vars: {} };
    if (p.status === "accepted" || p.status === "declined") return { resolved: `proposal_${p.status}`, vars: {} };
    return {
      resolved: null,
      vars: { proposal_title: p.title, proposal_link: proposalUrl(p.token), proposal_amount: money(p.amount, p.currency) },
    };
  }
  if (e.refType === "invoice" && e.refId) {
    const inv = await db.query.invoices.findFirst({ where: eq(invoices.id, e.refId) });
    if (!inv) return { resolved: "invoice_deleted", vars: {} };
    if (inv.status === "paid" || inv.status === "void" || inv.status === "uncollectible") {
      return { resolved: `invoice_${inv.status}`, vars: {} };
    }
    const due = Math.max(inv.amountDue - inv.amountPaid, 0);
    return {
      resolved: null,
      vars: {
        invoice_number: inv.number ?? "",
        invoice_amount: money(due || inv.amountDue, inv.currency),
        invoice_link: inv.hostedUrl ?? "",
        due_date: inv.dueDate ? inv.dueDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "",
      },
    };
  }
  return { resolved: null, vars: {} };
}

async function stop(e: Enrollment, reason: string) {
  await db
    .update(sequenceEnrollments)
    .set({ status: "stopped", stopReason: reason, nextRunAt: null })
    .where(eq(sequenceEnrollments.id, e.id));
}

export async function processDueEnrollments(opts: { limit?: number } = {}): Promise<RunSummary> {
  const limit = opts.limit ?? 50;
  const now = new Date();
  const summary: RunSummary = { processed: 0, sent: 0, stopped: 0, completed: 0, failed: 0 };

  const due = await db
    .select({ e: sequenceEnrollments })
    .from(sequenceEnrollments)
    .innerJoin(sequences, eq(sequences.id, sequenceEnrollments.sequenceId))
    .where(
      and(
        eq(sequenceEnrollments.status, "active"),
        isNotNull(sequenceEnrollments.nextRunAt),
        lte(sequenceEnrollments.nextRunAt, now),
        // Paused sequences keep their enrollments waiting until re-activated.
        eq(sequences.active, true),
      ),
    )
    .orderBy(asc(sequenceEnrollments.nextRunAt))
    .limit(limit);

  if (!due.length) return summary;
  const settings = await getSettings();

  for (const { e: candidate } of due) {
    // Claim: push nextRunAt forward only if it's still due (a concurrent run will then skip it).
    const [e] = await db
      .update(sequenceEnrollments)
      .set({ nextRunAt: new Date(Date.now() + CLAIM_MS) })
      .where(
        and(
          eq(sequenceEnrollments.id, candidate.id),
          eq(sequenceEnrollments.status, "active"),
          lte(sequenceEnrollments.nextRunAt, now),
        ),
      )
      .returning();
    if (!e) continue;
    summary.processed++;

    try {
      const [seq, client] = await Promise.all([
        db.query.sequences.findFirst({ where: eq(sequences.id, e.sequenceId) }),
        db.query.clients.findFirst({ where: eq(clients.id, e.clientId) }),
      ]);
      if (!seq || !client) {
        await stop(e, "missing");
        summary.stopped++;
        continue;
      }

      const step = seq.steps[e.currentStep];
      if (!step) {
        await db
          .update(sequenceEnrollments)
          .set({ status: "completed", nextRunAt: null })
          .where(eq(sequenceEnrollments.id, e.id));
        summary.completed++;
        continue;
      }

      const ref = await loadRef(e);
      if (ref.resolved) {
        await stop(e, ref.resolved);
        await logActivity(client.id, "sequence.stopped", `“${seq.name}” stopped — ${ref.resolved.replace(/_/g, " ")}`, {
          sequenceId: seq.id,
          enrollmentId: e.id,
        });
        summary.stopped++;
        continue;
      }

      if (seq.stopOnReply && client.lastRepliedAt && client.lastRepliedAt > e.createdAt) {
        await stop(e, "replied");
        summary.stopped++;
        continue;
      }

      const suppressed = await db.query.suppressions.findFirst({
        where: eq(suppressions.email, client.email.toLowerCase()),
      });
      if (suppressed) {
        await stop(e, `suppressed_${suppressed.reason}`);
        summary.stopped++;
        continue;
      }

      const vars = { ...ref.vars, sender_name: settings.fromName, business_name: settings.businessName };
      const clientVars = { first_name: firstName(client.name), name: client.name, company: client.company, email: client.email };
      const subject = fillTags(step.subject, vars);
      const body = fillTags(step.body, vars);

      let conversationId = e.conversationId;
      if (conversationId) {
        const exists = await db.query.conversations.findFirst({
          where: eq(conversations.id, conversationId),
          columns: { id: true },
        });
        if (!exists) conversationId = null;
      }
      if (!conversationId) {
        const convo = await createConversation(client.id, mergeTags(subject, clientVars) || seq.name);
        conversationId = convo.id;
        await db.update(sequenceEnrollments).set({ conversationId }).where(eq(sequenceEnrollments.id, e.id));
      }

      // Follow-ups after the first stay in the same thread ("Re: <first subject>").
      await sendConversationEmail({
        conversationId,
        bodyText: body,
        subject: e.currentStep === 0 || !e.conversationId ? subject : undefined,
        tags: { sequence_id: seq.id, enrollment_id: e.id },
      });
      summary.sent++;

      const nextIndex = e.currentStep + 1;
      const next = seq.steps[nextIndex];
      await db
        .update(sequenceEnrollments)
        .set(
          next
            ? { currentStep: nextIndex, nextRunAt: new Date(Date.now() + Math.max(0, next.delayDays) * DAY) }
            : { currentStep: nextIndex, status: "completed", nextRunAt: null },
        )
        .where(eq(sequenceEnrollments.id, e.id));
      if (!next) summary.completed++;

      await logActivity(
        client.id,
        "sequence.step_sent",
        `Follow-up sent: “${mergeTags(subject, clientVars)}” (${seq.name}, step ${e.currentStep + 1}/${seq.steps.length})`,
        { sequenceId: seq.id, enrollmentId: e.id, conversationId, step: e.currentStep },
      );
    } catch (err) {
      summary.failed++;
      console.error(`[automations] enrollment ${e.id} failed`, err);
      await db
        .update(sequenceEnrollments)
        .set({ nextRunAt: new Date(Date.now() + RETRY_MS) })
        .where(eq(sequenceEnrollments.id, e.id));
    }
  }

  return summary;
}
