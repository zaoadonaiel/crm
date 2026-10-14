import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  activities,
  campaignRecipients,
  clients,
  conversations,
  messages,
  sequenceEnrollments,
  sequences,
} from "@/db/schema";
import { inboundReplyAddress, sendEmail } from "@/lib/email/send";
import { personalEmailHtml } from "@/lib/email/transactional";
import { firstName, mergeTags } from "@/lib/utils";

function preview(text: string) {
  return text.replace(/\s+/g, " ").trim().slice(0, 140);
}

export async function logActivity(clientId: string | null, type: string, summary: string, meta: Record<string, unknown> = {}) {
  await db.insert(activities).values({ clientId, type, summary, meta });
}

export async function createConversation(clientId: string, subject: string, campaignId?: string) {
  const [c] = await db.insert(conversations).values({ clientId, subject, campaignId }).returning();
  return c!;
}

/** Latest open thread for a client, or a new one. */
export async function getOrCreateConversation(clientId: string, subject: string) {
  const existing = await db.query.conversations.findFirst({
    where: eq(conversations.clientId, clientId),
    orderBy: desc(conversations.lastMessageAt),
  });
  return existing ?? createConversation(clientId, subject);
}

/**
 * Send a personal (1:1) email inside a conversation. Replies come back to
 * reply+<conversationId>@INBOUND_EMAIL_DOMAIN and are threaded automatically.
 */
export async function sendConversationEmail(opts: {
  conversationId: string;
  bodyText: string;
  subject?: string;
  userId?: string;
  tags?: Record<string, string>;
}) {
  const convo = await db.query.conversations.findFirst({
    where: eq(conversations.id, opts.conversationId),
    with: { client: true },
  });
  if (!convo) throw new Error("Conversation not found");
  const client = convo.client;

  const vars = { first_name: firstName(client.name), name: client.name, company: client.company, email: client.email };
  const body = mergeTags(opts.bodyText, vars);
  const baseSubject = mergeTags(opts.subject || convo.subject || "Quick note", vars);

  const lastInbound = await db.query.messages.findFirst({
    where: and(eq(messages.conversationId, convo.id), eq(messages.direction, "in")),
    orderBy: desc(messages.createdAt),
  });
  const subject = lastInbound && !/^re:/i.test(baseSubject) ? `Re: ${baseSubject}` : baseSubject;
  const headers: Record<string, string> = {};
  if (lastInbound?.providerId) {
    const ref = lastInbound.providerId.includes("<") ? lastInbound.providerId : `<${lastInbound.providerId}>`;
    headers["In-Reply-To"] = ref;
    headers["References"] = ref;
  }

  const result = await sendEmail({
    to: client.email,
    subject,
    html: await personalEmailHtml(body),
    replyTo: inboundReplyAddress(convo.id),
    headers,
    tags: { conversation_id: convo.id, ...(opts.tags ?? {}) },
  });

  const now = new Date();
  const [msg] = await db
    .insert(messages)
    .values({
      conversationId: convo.id,
      direction: "out",
      channel: "email",
      toEmail: client.email,
      subject,
      bodyText: body,
      providerId: result.id,
      sentByUserId: opts.userId,
    })
    .returning();
  await db
    .update(conversations)
    .set({
      lastMessageAt: now,
      lastMessagePreview: preview(body),
      lastMessageDirection: "out",
      subject: convo.subject || baseSubject,
      unread: false,
    })
    .where(eq(conversations.id, convo.id));
  await db.update(clients).set({ lastContactedAt: now }).where(eq(clients.id, client.id));
  return msg!;
}

/** Record a message a client wrote from their portal. */
export async function recordPortalMessage(clientId: string, bodyText: string) {
  const convo = await getOrCreateConversation(clientId, "Message from client portal");
  return recordInbound({ conversationId: convo.id, clientId, bodyText, channel: "portal" });
}

/** Admin-only internal note on a thread (never emailed). */
export async function addNote(conversationId: string, bodyText: string, userId?: string) {
  const [msg] = await db
    .insert(messages)
    .values({ conversationId, direction: "out", channel: "note", bodyText, sentByUserId: userId })
    .returning();
  return msg!;
}

/**
 * Store an inbound email reply. Finds the thread from the reply+<id>@ address,
 * falling back to the sender's most recent conversation. Unknown senders are
 * added as leads so nothing gets lost.
 */
export async function recordInboundEmail(opts: {
  fromEmail: string;
  fromName?: string;
  toEmails: string[];
  subject?: string;
  text: string;
  html?: string;
  messageId?: string;
}) {
  const fromEmail = opts.fromEmail.toLowerCase().trim();
  let conversationId: string | undefined;
  for (const to of opts.toEmails) {
    const m = to.match(/reply\+([A-Za-z0-9_-]+)@/i);
    if (m) {
      const c = await db.query.conversations.findFirst({ where: eq(conversations.id, m[1]!) });
      if (c) conversationId = c.id;
    }
  }

  let client = await db.query.clients.findFirst({ where: eq(clients.email, fromEmail) });
  if (conversationId && !client) {
    const c = await db.query.conversations.findFirst({ where: eq(conversations.id, conversationId), with: { client: true } });
    client = c?.client;
  }
  if (!client) {
    [client] = await db
      .insert(clients)
      .values({ name: opts.fromName || fromEmail.split("@")[0]!, email: fromEmail, status: "lead" })
      .returning();
    await logActivity(client!.id, "client.created", "Added automatically from an inbound email");
  }
  if (!conversationId) {
    conversationId = (await getOrCreateConversation(client!.id, opts.subject || "New message")).id;
  }

  if (opts.messageId) {
    const dup = await db.query.messages.findFirst({ where: eq(messages.providerId, opts.messageId) });
    if (dup) return dup;
  }

  return recordInbound({
    conversationId,
    clientId: client!.id,
    bodyText: opts.text,
    bodyHtml: opts.html,
    subject: opts.subject,
    fromEmail,
    providerId: opts.messageId,
    channel: "email",
  });
}

async function recordInbound(opts: {
  conversationId: string;
  clientId: string;
  bodyText: string;
  bodyHtml?: string;
  subject?: string;
  fromEmail?: string;
  providerId?: string;
  channel: "email" | "portal";
}) {
  const now = new Date();
  const [msg] = await db
    .insert(messages)
    .values({
      conversationId: opts.conversationId,
      direction: "in",
      channel: opts.channel,
      fromEmail: opts.fromEmail,
      subject: opts.subject,
      bodyText: opts.bodyText,
      bodyHtml: opts.bodyHtml,
      providerId: opts.providerId,
    })
    .returning();

  await db
    .update(conversations)
    .set({ lastMessageAt: now, lastMessagePreview: preview(opts.bodyText), lastMessageDirection: "in", unread: true })
    .where(eq(conversations.id, opts.conversationId));
  await db.update(clients).set({ lastRepliedAt: now }).where(eq(clients.id, opts.clientId));

  // A reply stops any follow-up sequences configured to stop on reply.
  const active = await db
    .select({ id: sequenceEnrollments.id })
    .from(sequenceEnrollments)
    .innerJoin(sequences, eq(sequences.id, sequenceEnrollments.sequenceId))
    .where(
      and(
        eq(sequenceEnrollments.clientId, opts.clientId),
        eq(sequenceEnrollments.status, "active"),
        eq(sequences.stopOnReply, true),
      ),
    );
  for (const e of active) {
    await db
      .update(sequenceEnrollments)
      .set({ status: "stopped", stopReason: "replied", nextRunAt: null })
      .where(eq(sequenceEnrollments.id, e.id));
  }

  await db
    .update(campaignRecipients)
    .set({ repliedAt: now })
    .where(and(eq(campaignRecipients.conversationId, opts.conversationId), sql`${campaignRecipients.repliedAt} is null`));

  await logActivity(opts.clientId, "message.received", `Replied: “${preview(opts.bodyText).slice(0, 80)}”`, {
    conversationId: opts.conversationId,
  });
  return msg!;
}
