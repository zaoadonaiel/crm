"use server";

import { refresh, revalidatePath } from "next/cache";
import { and, asc, eq, ilike, or } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { db } from "@/db";
import { clients, conversations, settings } from "@/db/schema";
import { addNote, createConversation, logActivity, sendConversationEmail } from "@/lib/conversations";
import { assertAdmin } from "@/lib/session";
import type { ActionResult, ClientOption, ConversationStatus, Snippet } from "@/components/inbox/types";

function fail(err: unknown): { ok: false; error: string } {
  console.error("[inbox]", err);
  return { ok: false, error: err instanceof Error ? err.message : "Something went wrong" };
}

function revalidateInbox() {
  revalidatePath("/inbox");
  // Re-render the whole route (incl. the sidebar unread badge in the admin layout).
  refresh();
}

const idSchema = z.string().min(1).max(64);

export async function markConversationRead(id: string): Promise<ActionResult> {
  try {
    await assertAdmin();
    await db
      .update(conversations)
      .set({ unread: false })
      .where(and(eq(conversations.id, idSchema.parse(id)), eq(conversations.unread, true)));
    revalidateInbox();
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function markConversationUnread(id: string): Promise<ActionResult> {
  try {
    await assertAdmin();
    await db.update(conversations).set({ unread: true }).where(eq(conversations.id, idSchema.parse(id)));
    revalidateInbox();
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function setConversationStatus(id: string, status: ConversationStatus): Promise<ActionResult> {
  try {
    await assertAdmin();
    const s = z.enum(["open", "interested", "closed"]).parse(status);
    const [c] = await db
      .update(conversations)
      .set({ status: s })
      .where(eq(conversations.id, idSchema.parse(id)))
      .returning({ clientId: conversations.clientId, subject: conversations.subject });
    if (c && s !== "open") {
      await logActivity(c.clientId, `conversation.${s}`, s === "interested" ? `Marked “${c.subject || "conversation"}” as interested` : `Closed “${c.subject || "conversation"}”`, {
        conversationId: id,
      });
    }
    revalidateInbox();
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

const replySchema = z.object({
  conversationId: idSchema,
  body: z.string().trim().min(1, "Write a message first").max(20_000),
  note: z.boolean().default(false),
});

export async function sendReply(input: { conversationId: string; body: string; note?: boolean }): Promise<ActionResult> {
  try {
    const session = await assertAdmin();
    const { conversationId, body, note } = replySchema.parse(input);
    if (note) {
      await addNote(conversationId, body, session.user.id);
    } else {
      const msg = await sendConversationEmail({ conversationId, bodyText: body, userId: session.user.id });
      const convo = await db.query.conversations.findFirst({ where: eq(conversations.id, conversationId) });
      if (convo) {
        await logActivity(convo.clientId, "message.sent", `Emailed: “${msg.subject ?? convo.subject}”`, { conversationId });
      }
    }
    revalidateInbox();
    return { ok: true };
  } catch (err) {
    if (err instanceof z.ZodError) return { ok: false, error: err.issues[0]?.message ?? "Invalid input" };
    return fail(err);
  }
}

export async function searchClients(query: string, limit = 8): Promise<ClientOption[]> {
  await assertAdmin();
  const q = query.trim().slice(0, 100);
  const pattern = `%${q.replace(/[\\%_]/g, (m) => "\\" + m)}%`;
  return db
    .select({ id: clients.id, name: clients.name, email: clients.email, company: clients.company })
    .from(clients)
    .where(q ? or(ilike(clients.name, pattern), ilike(clients.email, pattern), ilike(clients.company, pattern)) : undefined)
    .orderBy(asc(clients.name))
    .limit(Math.min(Math.max(1, Math.floor(Number(limit) || 8)), 50));
}

const newSchema = z.object({
  clientId: idSchema,
  subject: z.string().trim().min(1, "Add a subject").max(300),
  body: z.string().trim().min(1, "Write a message first").max(20_000),
});

export async function startConversation(input: { clientId: string; subject: string; body: string }): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await assertAdmin();
    const { clientId, subject, body } = newSchema.parse(input);
    const client = await db.query.clients.findFirst({ where: eq(clients.id, clientId) });
    if (!client) return { ok: false, error: "Client not found" };
    const convo = await createConversation(clientId, subject);
    try {
      await sendConversationEmail({ conversationId: convo.id, bodyText: body, subject, userId: session.user.id });
    } catch (err) {
      // Don't leave an empty thread behind if the send failed.
      await db.delete(conversations).where(eq(conversations.id, convo.id));
      throw err;
    }
    await logActivity(clientId, "message.sent", `Emailed: “${subject}”`, { conversationId: convo.id });
    revalidateInbox();
    return { ok: true, data: { id: convo.id } };
  } catch (err) {
    if (err instanceof z.ZodError) return { ok: false, error: err.issues[0]?.message ?? "Invalid input" };
    return fail(err);
  }
}

const snippetsSchema = z
  .array(
    z.object({
      id: z.string().min(1).max(40),
      title: z.string().trim().min(1, "Every snippet needs a title").max(80),
      body: z.string().max(5_000),
    }),
  )
  .max(50);

export async function saveSnippets(list: Snippet[]): Promise<ActionResult<Snippet[]>> {
  try {
    await assertAdmin();
    const value = snippetsSchema.parse(list).map((s) => ({ ...s, id: s.id || nanoid(8) }));
    await db
      .insert(settings)
      .values({ key: "snippets", value })
      .onConflictDoUpdate({ target: settings.key, set: { value } });
    revalidatePath("/inbox");
    return { ok: true, data: value };
  } catch (err) {
    if (err instanceof z.ZodError) return { ok: false, error: err.issues[0]?.message ?? "Invalid snippet" };
    return fail(err);
  }
}
