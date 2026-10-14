import Link from "next/link";
import { asc, sql } from "drizzle-orm";
import { CircleCheck, CirclePlay, CircleStop, FileText, Hand, Receipt, Workflow } from "lucide-react";
import { db } from "@/db";
import { sequenceEnrollments, sequences } from "@/db/schema";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { ensureDefaultSequences } from "@/lib/automations/defaults";
import { requireAdmin } from "@/lib/session";
import { ActiveToggle, NewSequenceButton, RunNowButton } from "@/components/automations/list-controls";
import { triggerInfo } from "@/components/automations/constants";

export const metadata = { title: "Automations" };

const TRIGGER_ICON = { proposal_sent: FileText, invoice_sent: Receipt, manual: Hand } as const;

export default async function AutomationsPage() {
  await requireAdmin();
  await ensureDefaultSequences();

  const [rows, stats] = await Promise.all([
    db.select().from(sequences).orderBy(asc(sequences.createdAt)),
    db
      .select({
        sequenceId: sequenceEnrollments.sequenceId,
        active: sql<number>`(count(*) filter (where ${sequenceEnrollments.status} = 'active'))::int`,
        completed: sql<number>`(count(*) filter (where ${sequenceEnrollments.status} = 'completed'))::int`,
        stopped: sql<number>`(count(*) filter (where ${sequenceEnrollments.status} = 'stopped'))::int`,
        replied: sql<number>`(count(*) filter (where ${sequenceEnrollments.stopReason} = 'replied'))::int`,
      })
      .from(sequenceEnrollments)
      .groupBy(sequenceEnrollments.sequenceId),
  ]);
  const byId = new Map(stats.map((s) => [s.sequenceId, s]));

  return (
    <div>
      <PageHeader
        title="Automations"
        icon={<Workflow className="h-5 w-5" />}
        description="Follow-up sequences that nudge clients until they reply, sign or pay."
        actions={
          <>
            <RunNowButton />
            <NewSequenceButton />
          </>
        }
      />
      <div className="mx-auto max-w-6xl p-4 sm:p-6">
        {rows.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Workflow className="h-5 w-5" />}
              title="No sequences yet"
              description="Create a follow-up sequence to automatically chase proposals, invoices or cold leads."
              action={<NewSequenceButton />}
            />
          </Card>
        ) : (
          <ul className="grid gap-3" role="list">
            {rows.map((s) => {
              const st = byId.get(s.id) ?? { active: 0, completed: 0, stopped: 0, replied: 0 };
              const info = triggerInfo(s.trigger);
              const Icon = TRIGGER_ICON[s.trigger] ?? Hand;
              const days = s.steps.reduce((a, x) => a + x.delayDays, 0);
              const total = st.active + st.completed + st.stopped;
              return (
                <li key={s.id}>
                  <Card className="flex flex-col gap-4 p-4 transition-shadow hover:shadow-sm sm:flex-row sm:items-center sm:p-5">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link href={`/automations/${s.id}`} className="truncate text-[15px] font-semibold hover:text-brand">
                            {s.name}
                          </Link>
                          {!s.active && <Badge>Paused</Badge>}
                        </div>
                        <p className="mt-0.5 text-[13px] text-muted">
                          {info.short} · {s.steps.length} {s.steps.length === 1 ? "step" : "steps"}
                          {s.steps.length > 0 && ` over ${days} ${days === 1 ? "day" : "days"}`}
                          {s.stopOnReply && " · stops on reply"}
                        </p>
                      </div>
                    </div>
                    <dl className="grid grid-cols-3 gap-2 text-center sm:w-80 sm:gap-4">
                      <Stat icon={<CirclePlay className="h-3.5 w-3.5 text-blue-600" />} label="Active" value={st.active} />
                      <Stat icon={<CircleCheck className="h-3.5 w-3.5 text-green-600" />} label="Completed" value={st.completed} />
                      <Stat
                        icon={<CircleStop className="h-3.5 w-3.5 text-muted" />}
                        label="Stopped"
                        value={st.stopped}
                        sub={total > 0 && st.replied > 0 ? `${Math.round((st.replied / total) * 100)}% replied` : undefined}
                      />
                    </dl>
                    <div className="flex items-center justify-between gap-3 border-t border-border pt-3 sm:border-0 sm:pt-0">
                      <ActiveToggle id={s.id} active={s.active} name={s.name} />
                      <Link
                        href={`/automations/${s.id}`}
                        className="rounded-lg border border-border px-3 py-1.5 text-[13px] font-medium hover:bg-surface-2"
                      >
                        Edit
                      </Link>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-6 text-center text-xs text-muted">
          Sequences send plain, personal-looking emails from your address. Replies thread into the Inbox and stop the sequence.
        </p>
      </div>
    </div>
  );
}

function Stat({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: number; sub?: string }) {
  return (
    <div className="rounded-lg bg-surface-2 px-2 py-1.5">
      <dt className="flex items-center justify-center gap-1 text-[11px] text-muted">
        {icon}
        {label}
      </dt>
      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
      {sub && <dd className="text-[10px] text-muted">{sub}</dd>}
    </div>
  );
}
