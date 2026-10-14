/**
 * Provider-agnostic email sending. Set EMAIL_PROVIDER=resend (default) or mailgun.
 * With no API key configured, emails are logged to the console (handy for local dev).
 */
import { getSettings } from "@/lib/settings";
import { htmlToText } from "@/lib/utils";

export type OutgoingEmail = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
  headers?: Record<string, string>;
  /** tags for provider analytics/webhooks, e.g. { campaign_id: "..." } */
  tags?: Record<string, string>;
};

export type SendResult = { id: string; provider: "resend" | "mailgun" | "console" };

export function inboundReplyAddress(conversationId: string) {
  const domain = process.env.INBOUND_EMAIL_DOMAIN;
  return domain ? `reply+${conversationId}@${domain}` : undefined;
}

export async function defaultFrom() {
  const s = await getSettings();
  return `${s.fromName} <${s.fromEmail}>`;
}

export async function sendEmail(email: OutgoingEmail): Promise<SendResult> {
  const from = email.from ?? (await defaultFrom());
  const text = email.text ?? htmlToText(email.html);
  const provider = (process.env.EMAIL_PROVIDER || "resend").toLowerCase();

  if (provider === "mailgun" && process.env.MAILGUN_API_KEY) {
    return sendMailgun({ ...email, from, text });
  }
  if (process.env.RESEND_API_KEY) {
    return sendResend({ ...email, from, text });
  }
  console.log(
    `\n[email:console] ─────────────────────────────\nFrom: ${from}\nTo: ${email.to}\nReply-To: ${email.replyTo ?? "-"}\nSubject: ${email.subject}\n\n${text.slice(0, 1200)}\n────────────────────────────────────────────\n`,
  );
  return { id: `console_${crypto.randomUUID()}`, provider: "console" };
}

async function sendResend(e: OutgoingEmail & { from: string; text: string }): Promise<SendResult> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: e.from,
      to: [e.to],
      subject: e.subject,
      html: e.html,
      text: e.text,
      reply_to: e.replyTo ? [e.replyTo] : undefined,
      headers: e.headers,
      tags: e.tags
        ? Object.entries(e.tags).map(([name, value]) => ({ name, value: value.replace(/[^a-zA-Z0-9_-]/g, "_") }))
        : undefined,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!res.ok || !data.id) throw new Error(`Resend error (${res.status}): ${data.message ?? "unknown"}`);
  return { id: data.id, provider: "resend" };
}

async function sendMailgun(e: OutgoingEmail & { from: string; text: string }): Promise<SendResult> {
  const domain = process.env.MAILGUN_DOMAIN;
  if (!domain) throw new Error("MAILGUN_DOMAIN is not set");
  const base = process.env.MAILGUN_API_BASE || "https://api.mailgun.net";
  const form = new FormData();
  form.append("from", e.from);
  form.append("to", e.to);
  form.append("subject", e.subject);
  form.append("html", e.html);
  form.append("text", e.text);
  if (e.replyTo) form.append("h:Reply-To", e.replyTo);
  for (const [k, v] of Object.entries(e.headers ?? {})) form.append(`h:${k}`, v);
  for (const [k, v] of Object.entries(e.tags ?? {})) form.append(`v:${k}`, v);
  form.append("o:tracking", "yes");
  const res = await fetch(`${base}/v3/${domain}/messages`, {
    method: "POST",
    headers: { Authorization: `Basic ${btoa(`api:${process.env.MAILGUN_API_KEY}`)}` },
    body: form,
  });
  const data = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!res.ok || !data.id) throw new Error(`Mailgun error (${res.status}): ${data.message ?? "unknown"}`);
  return { id: data.id.replace(/^<|>$/g, ""), provider: "mailgun" };
}
