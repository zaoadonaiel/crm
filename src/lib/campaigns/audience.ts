import { and, eq, exists, inArray, isNull, lt, notExists, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { clients, invoices, proposals, suppressions, type Audience } from "@/db/schema";

export type AudienceMember = {
  clientId: string;
  email: string;
  name: string;
  company: string | null;
};

/**
 * WHERE clause for an audience, or `null` when the audience selects nobody
 * (e.g. "by tag" with no tags chosen).
 */
function audienceWhere(audience: Audience): SQL | null {
  const notSuppressed = notExists(
    db
      .select({ one: sql`1` })
      .from(suppressions)
      .where(sql`lower(${suppressions.email}) = lower(${clients.email})`),
  );
  const hasEmail = sql`${clients.email} <> ''`;

  let filter: SQL | undefined;
  switch (audience.mode) {
    case "all":
      filter = undefined;
      break;
    case "statuses": {
      const statuses = audience.statuses ?? [];
      if (!statuses.length) return null;
      filter = inArray(clients.status, statuses);
      break;
    }
    case "tags": {
      const tags = (audience.tags ?? []).filter(Boolean);
      if (!tags.length) return null;
      filter = sql`${clients.tags} ?| array[${sql.join(
        tags.map((t) => sql`${t}`),
        sql`, `,
      )}]::text[]`;
      break;
    }
    case "clients": {
      const ids = audience.clientIds ?? [];
      if (!ids.length) return null;
      filter = inArray(clients.id, ids);
      break;
    }
    case "segment": {
      switch (audience.segment) {
        case "proposal_no_response":
          filter = exists(
            db
              .select({ one: sql`1` })
              .from(proposals)
              .where(
                and(
                  eq(proposals.clientId, clients.id),
                  inArray(proposals.status, ["sent", "viewed"]),
                  or(
                    isNull(clients.lastRepliedAt),
                    isNull(proposals.sentAt),
                    lt(clients.lastRepliedAt, proposals.sentAt),
                  ),
                ),
              ),
          );
          break;
        case "invoice_unpaid":
          filter = exists(
            db
              .select({ one: sql`1` })
              .from(invoices)
              .where(and(eq(invoices.clientId, clients.id), eq(invoices.status, "open"))),
          );
          break;
        case "no_contact_90d": {
          const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
          filter = or(isNull(clients.lastContactedAt), lt(clients.lastContactedAt, cutoff));
          break;
        }
        default:
          return null;
      }
      break;
    }
    default:
      return null;
  }
  return and(hasEmail, notSuppressed, filter) ?? hasEmail;
}

/** Everyone the campaign would go to: deduped by email, suppressions excluded. */
export async function resolveAudience(audience: Audience): Promise<AudienceMember[]> {
  const where = audienceWhere(audience);
  if (!where) return [];
  const rows = await db
    .select({ clientId: clients.id, email: clients.email, name: clients.name, company: clients.company })
    .from(clients)
    .where(where)
    .orderBy(clients.createdAt);

  const seen = new Set<string>();
  const out: AudienceMember[] = [];
  for (const r of rows) {
    const email = r.email.trim().toLowerCase();
    if (!email || !email.includes("@") || seen.has(email)) continue;
    seen.add(email);
    out.push({ ...r, email });
  }
  return out;
}

/** Number of unique recipients for an audience. */
export async function countAudience(audience: Audience): Promise<number> {
  const where = audienceWhere(audience);
  if (!where) return 0;
  const [row] = await db
    .select({ n: sql<number>`count(distinct lower(trim(${clients.email})))::int` })
    .from(clients)
    .where(where);
  return Number(row?.n ?? 0);
}

/** Is this address on the suppression list? */
export async function isSuppressed(email: string) {
  const row = await db.query.suppressions.findFirst({
    where: eq(sql`lower(${suppressions.email})`, email.trim().toLowerCase()),
  });
  return !!row;
}
