/**
 * Provider-agnostic application of email webhook events (Resend + Mailgun).
 * Every function here is idempotent so providers can safely retry.
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { campaignRecipients, clients, messages, suppressions } from "@/db/schema";
import { logActivity } from "@/lib/conversations";

export type DeliveryEvent = "sent" | "delivered" | "opened" | "clicked" | "bounced" | "complained" | "delayed" | "unsubscribed";

type RecipientStatus = (typeof campaignRecipients.$inferSelect)["status"];

/** Forward-only progression. Terminal failure states override everything. */
const RANK: Partial<Record<RecipientStatus, number>> = {
  queued: 0,
  sent: 1,
  delivered: 2,
  opened: 3,
  clicked: 4,
};
const TERMINAL: RecipientStatus[] = ["bounced", "complained"];

export function nextRecipientStatus(current: RecipientStatus, incoming: RecipientStatus): RecipientStatus {
  if (incoming === "bounced" || incoming === "complained") {
    // A complaint is the strongest signal; don't downgrade it to a bounce.
    if (current === "complained") return current;
    return incoming;
  }
  if (TERMINAL.includes(current)) return current;
  const cur = RANK[current];
  const inc = RANK[incoming];
  if (inc === undefined) return current;
  if (cur === undefined) return incoming; // failed/skipped → a later positive signal wins
  return inc > cur ? incoming : current;
}

/** "Jane Doe <jane@acme.com>" → { name: "Jane Doe", email: "jane@acme.com" } */
export function parseAddress(raw: string | null | undefined): { name?: string; email: string } {
  const s = (raw ?? "").trim();
  const m = s.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (m) {
    const name = m[1]!.trim();
    return { name: name || undefined, email: m[2]!.trim().toLowerCase() };
  }
  return { email: s.replace(/^mailto:/i, "").trim().toLowerCase() };
}

/** Split a header-ish address list ("a@x, B <b@y>") or an array into plain emails. */
export function addressList(v: unknown): string[] {
  const items: string[] = [];
  const push = (x: unknown) => {
    if (typeof x === "string") {
      // Split on commas that aren't inside a quoted display name.
      for (const part of x.match(/(?:"[^"]*"|[^,])+/g) ?? []) if (part.trim()) items.push(part.trim());
    } else if (x && typeof x === "object" && "email" in x && typeof (x as { email: unknown }).email === "string") {
      items.push((x as { email: string }).email);
    }
  };
  if (Array.isArray(v)) v.forEach(push);
  else push(v);
  return items.map((i) => parseAddress(i).email).filter((e) => e.includes("@"));
}

export function normalizeMessageId(id: string | null | undefined) {
  if (!id) return undefined;
  const t = id.trim().replace(/^<|>$/g, "");
  return t || undefined;
}

export async function suppress(email: string, reason: "unsubscribed" | "bounced" | "complained" | "manual") {
  const e = email.toLowerCase().trim();
  if (!e.includes("@")) return;
  await db.insert(suppressions).values({ email: e, reason }).onConflictDoNothing();
}

export type DeliveryUpdate = {
  event: DeliveryEvent;
  /** provider message id (Resend email_id / Mailgun message-id without <>) */
  providerId?: string;
  /** recipient email address, used for suppressions and as a match fallback */
  email?: string;
  /** optional campaign id (from tags / user-variables) for fallback matching */
  campaignId?: string;
  at?: Date;
  /** for bounces: false = soft/transient bounce (no suppression) */
  permanent?: boolean;
  reason?: string;
};

/**
 * Apply one delivery/engagement event to campaign recipients (and 1:1 messages
 * for bounces). Safe to call repeatedly for the same event.
 */
export async function applyDeliveryEvent(u: DeliveryUpdate) {
  const at = u.at ?? new Date();
  const providerId = normalizeMessageId(u.providerId);
  const email = u.email?.toLowerCase().trim();

  // Soft bounces/delays don't change state beyond an informational error.
  const incoming: RecipientStatus | null =
    u.event === "bounced"
      ? u.permanent === false
        ? null
        : "bounced"
      : u.event === "complained"
        ? "complained"
        : u.event === "delayed" || u.event === "unsubscribed"
          ? null
          : u.event;

  let rows: (typeof campaignRecipients.$inferSelect)[] = [];
  if (providerId) {
    rows = await db.select().from(campaignRecipients).where(eq(campaignRecipients.providerId, providerId));
  }
  if (!rows.length && u.campaignId && email) {
    rows = await db
      .select()
      .from(campaignRecipients)
      .where(and(eq(campaignRecipients.campaignId, u.campaignId), sql`lower(${campaignRecipients.email}) = ${email}`));
  }

  for (const r of rows) {
    const patch: Partial<typeof campaignRecipients.$inferInsert> = {};
    if (incoming) {
      const next = nextRecipientStatus(r.status, incoming);
      if (next !== r.status) patch.status = next;
    }
    if (u.event === "opened" && !r.openedAt) patch.openedAt = at;
    if (u.event === "clicked") {
      if (!r.clickedAt) patch.clickedAt = at;
      if (!r.openedAt) patch.openedAt = at; // a click implies an open
    }
    if ((u.event === "bounced" || u.event === "delayed") && u.reason) {
      const label = u.event === "delayed" ? "Delivery delayed" : u.permanent === false ? "Soft bounce" : "Bounced";
      patch.error = `${label}: ${u.reason}`.slice(0, 500);
    }
    if (Object.keys(patch).length) {
      await db.update(campaignRecipients).set(patch).where(eq(campaignRecipients.id, r.id));
    }
  }

  const target = email ?? rows[0]?.email;
  if (target) {
    if (u.event === "bounced" && u.permanent !== false) await suppress(target, "bounced");
    if (u.event === "complained") await suppress(target, "complained");
    if (u.event === "unsubscribed") await suppress(target, "unsubscribed");
  }

  // A hard bounce on a 1:1 email: leave an internal note in that thread so it's visible in the inbox.
  if (providerId && (u.event === "bounced" || u.event === "complained") && u.permanent !== false) {
    await noteOnConversationMessage(providerId, u.event, u.reason, target);
  }

  return { matched: rows.length };
}

async function noteOnConversationMessage(providerId: string, event: "bounced" | "complained", reason?: string, email?: string) {
  const msg = await db.query.messages.findFirst({
    where: and(eq(messages.providerId, providerId), eq(messages.direction, "out")),
  });
  if (!msg) return;
  const noteKey = `${event}:${providerId}`;
  const dup = await db.query.messages.findFirst({ where: eq(messages.providerId, noteKey) });
  if (dup) return;
  const text =
    event === "bounced"
      ? `⚠️ Delivery failed${email ? ` to ${email}` : ""}${reason ? ` — ${reason}` : ""}. The address was added to the suppression list.`
      : `⚠️ ${email ?? "The recipient"} marked this email as spam. They were added to the suppression list.`;
  await db.insert(messages).values({
    conversationId: msg.conversationId,
    direction: "out",
    channel: "note",
    bodyText: text,
    providerId: noteKey,
  });
  if (email) {
    const client = await db.query.clients.findFirst({ where: eq(clients.email, email) });
    if (client) await logActivity(client.id, `email.${event}`, event === "bounced" ? "Email bounced" : "Marked an email as spam", { providerId, reason });
  }
}
