/**
 * Mailgun webhooks:
 *  (a) Inbound Routes — `forward("https://<app>/api/webhooks/mailgun")` posts the
 *      parsed message as multipart/form-data (or urlencoded).
 *  (b) Event webhooks — JSON `{ signature, "event-data" }` for delivered/opened/
 *      clicked/failed/complained/unsubscribed.
 * Both are signed with HMAC-SHA256(timestamp + token) using MAILGUN_WEBHOOK_SIGNING_KEY.
 */
import { recordInboundEmail } from "@/lib/conversations";
import { hmacHex, timingSafeEqual } from "@/lib/crypto";
import { addressList, applyDeliveryEvent, normalizeMessageId, parseAddress, type DeliveryEvent } from "@/lib/email/events";
import { htmlToText } from "@/lib/utils";

/** Mailgun may retry for a while; tokens are single-use in spirit and handlers are idempotent. */
const MAX_AGE_SECONDS = 24 * 60 * 60;

async function verifySignature(timestamp: string | undefined, token: string | undefined, signature: string | undefined) {
  const key = process.env.MAILGUN_WEBHOOK_SIGNING_KEY;
  if (!key) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[webhooks/mailgun] MAILGUN_WEBHOOK_SIGNING_KEY not set — accepting unsigned webhook (dev only)");
      return true;
    }
    return false;
  }
  if (!timestamp || !token || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > MAX_AGE_SECONDS) return false;
  const expected = await hmacHex(timestamp + token, key);
  return timingSafeEqual(expected, signature.toLowerCase());
}

function formStr(form: FormData, ...names: string[]) {
  for (const n of names) {
    const v = form.get(n);
    if (typeof v === "string" && v.trim()) return v;
  }
  return undefined;
}

async function handleInbound(form: FormData) {
  const from = parseAddress(formStr(form, "from", "From") ?? formStr(form, "sender") ?? "");
  const sender = formStr(form, "sender");
  const fromEmail = from.email.includes("@") ? from.email : sender ? parseAddress(sender).email : "";
  if (!fromEmail.includes("@")) return;

  const html = formStr(form, "body-html", "stripped-html");
  const text = formStr(form, "body-plain") ?? formStr(form, "stripped-text") ?? (html ? htmlToText(html) : "");
  const toEmails = [
    ...addressList(formStr(form, "recipient")),
    ...addressList(formStr(form, "To", "to")),
    ...addressList(formStr(form, "Cc", "cc")),
  ];

  await recordInboundEmail({
    fromEmail,
    fromName: from.name,
    toEmails,
    subject: formStr(form, "subject", "Subject"),
    text,
    html,
    messageId: normalizeMessageId(formStr(form, "Message-Id", "message-id", "Message-ID")),
  });
}

type MailgunEventData = {
  event?: string;
  severity?: string;
  reason?: string;
  timestamp?: number;
  recipient?: string;
  message?: { headers?: Record<string, string> };
  "user-variables"?: Record<string, unknown>;
  "delivery-status"?: { message?: string; description?: string; code?: number };
};

function eventFor(d: MailgunEventData): { event: DeliveryEvent; permanent?: boolean } | null {
  switch (d.event) {
    case "accepted":
      return null; // "sent" is recorded when we hand the message off
    case "delivered":
      return { event: "delivered" };
    case "opened":
      return { event: "opened" };
    case "clicked":
      return { event: "clicked" };
    case "complained":
      return { event: "complained" };
    case "unsubscribed":
      return { event: "unsubscribed" };
    case "failed":
      return d.severity === "permanent" ? { event: "bounced", permanent: true } : { event: "delayed" };
    default:
      return null;
  }
}

async function handleEvent(d: MailgunEventData) {
  const mapped = eventFor(d);
  if (!mapped) return;
  const vars = d["user-variables"] ?? {};
  const campaignId = typeof vars.campaign_id === "string" ? vars.campaign_id : undefined;
  const status = d["delivery-status"];
  await applyDeliveryEvent({
    event: mapped.event,
    permanent: mapped.permanent,
    providerId: normalizeMessageId(d.message?.headers?.["message-id"]),
    email: d.recipient,
    campaignId,
    at: d.timestamp ? new Date(d.timestamp * 1000) : undefined,
    reason: status?.description || status?.message || d.reason,
  });
}

export async function POST(req: Request) {
  const contentType = req.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      const json = (await req.json().catch(() => null)) as {
        signature?: { timestamp?: string; token?: string; signature?: string };
        "event-data"?: MailgunEventData;
      } | null;
      if (!json) return Response.json({ error: "invalid json" }, { status: 400 });
      const sig = json.signature ?? {};
      if (!(await verifySignature(String(sig.timestamp ?? ""), sig.token, sig.signature))) {
        return Response.json({ error: "invalid signature" }, { status: 401 });
      }
      if (json["event-data"]) await handleEvent(json["event-data"]);
      return Response.json({ ok: true });
    }

    if (contentType.includes("multipart/form-data") || contentType.includes("application/x-www-form-urlencoded")) {
      const form = await req.formData();
      if (!(await verifySignature(formStr(form, "timestamp"), formStr(form, "token"), formStr(form, "signature")))) {
        // 406 tells Mailgun Routes not to retry a message we'll never accept.
        return Response.json({ error: "invalid signature" }, { status: 406 });
      }
      await handleInbound(form);
      return Response.json({ ok: true });
    }

    return Response.json({ ok: true, ignored: contentType || "unknown" });
  } catch (err) {
    console.error("[webhooks/mailgun] processing failed", err);
    return Response.json({ error: "processing failed" }, { status: 500 });
  }
}
