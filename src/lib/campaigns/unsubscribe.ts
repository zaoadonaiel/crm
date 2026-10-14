import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { clients, suppressions } from "@/db/schema";
import { logActivity } from "@/lib/conversations";
import { signToken, verifyToken } from "@/lib/crypto";
import { appUrl } from "@/lib/utils";

function norm(email: string) {
  return email.trim().toLowerCase();
}

/** Signed unsubscribe URLs for an address. */
export async function unsubscribeLinks(email: string) {
  const token = await signToken(norm(email));
  return {
    token,
    /** Friendly confirmation page (footer link). */
    pageUrl: appUrl(`/u/${token}`),
    /** RFC 8058 one-click endpoint (List-Unsubscribe header). */
    oneClickUrl: appUrl(`/api/unsubscribe?t=${encodeURIComponent(token)}`),
  };
}

/** Returns the email for a valid token, or null. */
export async function emailFromToken(token: string) {
  try {
    const email = await verifyToken(decodeURIComponent(token));
    return email && email.includes("@") ? norm(email) : null;
  } catch {
    return null;
  }
}

async function clientFor(email: string) {
  return db.query.clients.findFirst({ where: eq(sql`lower(${clients.email})`, email) });
}

export async function getSuppression(email: string) {
  return db.query.suppressions.findFirst({ where: eq(sql`lower(${suppressions.email})`, norm(email)) });
}

export async function unsubscribeEmail(email: string, source: "page" | "one-click" = "page") {
  const e = norm(email);
  const inserted = await db
    .insert(suppressions)
    .values({ email: e, reason: "unsubscribed" })
    .onConflictDoNothing()
    .returning();
  if (inserted.length) {
    const client = await clientFor(e);
    await logActivity(client?.id ?? null, "campaign.unsubscribed", `${e} unsubscribed from marketing email`, { source });
  }
}

/** Only self-service unsubscribes can be undone by the recipient (not bounces/complaints). */
export async function resubscribeEmail(email: string) {
  const e = norm(email);
  const existing = await getSuppression(e);
  if (!existing || existing.reason !== "unsubscribed") return false;
  await db.delete(suppressions).where(eq(suppressions.email, existing.email));
  const client = await clientFor(e);
  await logActivity(client?.id ?? null, "campaign.resubscribed", `${e} resubscribed to marketing email`);
  return true;
}
