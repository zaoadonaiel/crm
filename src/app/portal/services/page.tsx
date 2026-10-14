import { asc, eq } from "drizzle-orm";
import { CalendarClock, Package } from "lucide-react";
import { db } from "@/db";
import { clientServices } from "@/db/schema";
import { requireClient } from "@/lib/session";
import { Badge, Card, EmptyState } from "@/components/ui";
import { statusTone } from "@/lib/status";
import { money } from "@/lib/utils";
import { fmtDate, intervalLabel } from "@/lib/billing/format";

export const metadata = { title: "Services" };

const ORDER = { active: 0, pending: 1, paused: 2, cancelled: 3 } as const;

export default async function PortalServices() {
  const { client } = await requireClient();
  if (!client) return null;
  const rows = (await db.query.clientServices.findMany({ where: eq(clientServices.clientId, client.id), orderBy: asc(clientServices.name) })).sort(
    (a, b) => ORDER[a.status] - ORDER[b.status],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Services</h1>
        <p className="mt-1 text-sm text-muted">Everything we manage for you, with the details you’ll need.</p>
      </div>
      {rows.length === 0 ? (
        <Card>
          <EmptyState icon={<Package className="h-5 w-5" />} title="No services yet" description="Services you have with us will appear here." />
        </Card>
      ) : (
        <div className="space-y-4">
          {rows.map((x) => (
            <Card key={x.id} className={x.status === "cancelled" ? "opacity-70" : ""}>
              <div className="flex flex-wrap items-start justify-between gap-4 p-5">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand">
                    <Package className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold">{x.name}</h2>
                      <Badge tone={statusTone(x.status)}>{x.status}</Badge>
                    </div>
                    {x.description && <p className="mt-1 max-w-prose text-sm text-muted">{x.description}</p>}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold tabular-nums">
                    {money(x.price, x.currency)}
                    <span className="text-sm font-normal text-muted">{intervalLabel(x.interval, true)}</span>
                  </p>
                  <p className="text-xs text-muted">{intervalLabel(x.interval)}</p>
                </div>
              </div>
              {Object.keys(x.details).length > 0 && (
                <dl className="grid gap-x-6 gap-y-3 border-t border-border px-5 py-4 text-sm sm:grid-cols-3">
                  {Object.entries(x.details).map(([k, v]) => (
                    <div key={k} className="min-w-0">
                      <dt className="text-xs text-muted">{k}</dt>
                      <dd className="break-words font-medium">
                        {/^https?:\/\//i.test(v) ? (
                          <a href={v} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">
                            {v.replace(/^https?:\/\//, "")}
                          </a>
                        ) : (
                          v
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
              <div className="flex flex-wrap gap-x-6 gap-y-1 border-t border-border px-5 py-3 text-xs text-muted">
                {x.startDate && <span>Started {fmtDate(x.startDate)}</span>}
                {x.renewalDate && (
                  <span className="inline-flex items-center gap-1">
                    <CalendarClock className="h-3.5 w-3.5" /> {x.interval === "one_time" ? "Due" : "Renews"} {fmtDate(x.renewalDate)}
                  </span>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
