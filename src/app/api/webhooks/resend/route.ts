/**
 * Resend webhooks (Svix-signed): inbound replies (`email.received`) and
 * delivery/engagement events for campaign tracking + suppressions.
 */
import { recordInboundEmail } from "@/lib/conversations";
import { base64ToBytes, hmacBase64, timingSafeEqual } from "@/lib/crypto";
import { addressList, applyDeliveryEvent, normalizeMessageId, parseAddress, type DeliveryEvent } from "@/lib/email/events";
import { htmlToText } from "@/lib/utils";

const TOLERANCE_SECONDS = 5 * 60;

type ResendEvent = {
  type?: string;
  created_at?: string;
  data?: Record<string, unknown> & {
    email_id?: string;
    from?: string;
    to?: string[] | string;
    subject?: string;
    message_id?: string;
    tags?: Record<string, string> | { name: string; value: string }[];
    bounce?: { type?: string; subType?: string; message?: string };
    failed?: { reason?: string };
  };
};

async function verify(req: Request, body: string): Promise<boolean> {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[webhooks/resend] RESEND_WEBHOOK_SECRET not set — accepting unsigned webhook (dev only)");
      return true;
    }
    return false;
  }
  const id = req.headers.get("svix-id") ?? req.headers.get("webhook-id");
  const ts = req.headers.get("svix-timestamp") ?? req.headers.get("webhook-timestamp");
  const sigHeader = req.headers.get("svix-signature") ?? req.headers.get("webhook-signature");
  if (!id || !ts || !sigHeader) return false;

  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum) || Math.abs(Date.now() / 1000 - tsNum) > TOLERANCE_SECONDS) return false;

  let key: Uint8Array;
  try {
    key = base64ToBytes(secret.startsWith("whsec_") ? secret.slice(6) : secret);
  } catch {
    return false;
  }
  const expected = await hmacBase64(`${id}.${ts}.${body}`, key);
  return sigHeader
    .split(" ")
    .map((p) => p.trim())
    .filter(Boolean)
    .some((p) => {
      const [version, sig] = p.split(",", 2);
      return version === "v1" && !!sig && timingSafeEqual(sig, expected);
    });
}

function tagValue(tags: NonNullable<ResendEvent["data"]>["tags"], name: string) {
  if (!tags) return undefined;
  if (Array.isArray(tags)) return tags.find((t) => t.name === name)?.value;
  return (tags as Record<string, string>)[name];
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v : undefined;
}

/** Headers may come back as an object, or an array of { name, value }. */
function headerValue(headers: unknown, name: string): string | undefined {
  const lower = name.toLowerCase();
  if (Array.isArray(headers)) {
    const h = headers.find((x) => typeof x?.name === "string" && x.name.toLowerCase() === lower);
    return str(h?.value);
  }
  if (headers && typeof headers === "object") {
    for (const [k, v] of Object.entries(headers as Record<string, unknown>)) {
      if (k.toLowerCase() === lower) return Array.isArray(v) ? str(v[0]) : str(v);
    }
  }
  return undefined;
}

async function handleInbound(data: NonNullable<ResendEvent["data"]>) {
  const emailId = str(data.email_id) ?? str(data.id);
  let full: Record<string, unknown> = {};
  if (emailId && process.env.RESEND_API_KEY) {
    const res = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`, {
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
    });
    if (res.ok) {
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      full = (json.data && typeof json.data === "object" ? json.data : json) as Record<string, unknown>;
    } else if (res.status >= 500) {
      // Let Resend retry later rather than storing an empty message.
      throw new Error(`Resend receiving API ${res.status}`);
    } else {
      console.warn(`[webhooks/resend] could not fetch inbound email ${emailId}: ${res.status}`);
    }
  }

  const fromRaw = str(full.from) ?? str(data.from) ?? "";
  const from = parseAddress(fromRaw);
  if (!from.email.includes("@")) return;

  const html = str(full.html) ?? str(data.html);
  const text = str(full.text) ?? str(data.text) ?? (html ? htmlToText(html) : "");
  const toEmails = [
    ...addressList(full.to ?? data.to),
    ...addressList(full.cc ?? data.cc),
    ...addressList(full.bcc ?? data.bcc),
    ...addressList(headerValue(full.headers, "delivered-to")),
  ];
  const messageId =
    normalizeMessageId(headerValue(full.headers, "message-id")) ??
    normalizeMessageId(str(full.message_id)) ??
    normalizeMessageId(str(data.message_id)) ??
    (emailId ? `resend:${emailId}` : undefined);

  await recordInboundEmail({
    fromEmail: from.email,
    fromName: from.name,
    toEmails,
    subject: str(full.subject) ?? str(data.subject),
    text,
    html,
    messageId,
  });
}

const DELIVERY: Record<string, DeliveryEvent> = {
  "email.sent": "sent",
  "email.delivered": "delivered",
  "email.opened": "opened",
  "email.clicked": "clicked",
  "email.bounced": "bounced",
  "email.complained": "complained",
  "email.delivery_delayed": "delayed",
  "email.failed": "bounced",
};

export async function POST(req: Request) {
  const body = await req.text();
  if (!(await verify(req, body))) {
    return Response.json({ error: "invalid signature" }, { status: 401 });
  }

  let evt: ResendEvent;
  try {
    evt = JSON.parse(body) as ResendEvent;
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  const type = evt.type ?? "";
  const data = evt.data ?? {};

  try {
    if (type === "email.received") {
      await handleInbound(data);
      return Response.json({ ok: true });
    }

    const event = DELIVERY[type];
    if (!event) return Response.json({ ok: true, ignored: type });

    const bounceType = (data.bounce?.type ?? "").toLowerCase();
    const permanent = event === "bounced" ? !(bounceType === "transient" || bounceType === "soft") : undefined;
    const to = addressList(data.to)[0];
    await applyDeliveryEvent({
      event,
      providerId: str(data.email_id),
      email: to,
      campaignId: tagValue(data.tags, "campaign_id"),
      at: evt.created_at ? new Date(evt.created_at) : undefined,
      permanent: type === "email.failed" ? false : permanent,
      reason: data.bounce?.message ?? data.failed?.reason,
    });
    return Response.json({ ok: true });
  } catch (err) {
    console.error(`[webhooks/resend] failed to process ${type}`, err);
    // Non-2xx → Resend retries; all handlers are idempotent.
    return Response.json({ error: "processing failed" }, { status: 500 });
  }
}
