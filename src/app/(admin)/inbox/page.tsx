import { and, asc, desc, eq, ilike, ne, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { clients, conversations, messages, sequenceEnrollments, sequences, settings, suppressions } from "@/db/schema";
import { requireAdmin } from "@/lib/session";
import { InboxView } from "@/components/inbox/inbox-view";
import {
  DEFAULT_SNIPPETS,
  INBOX_FILTERS,
  type ClientOption,
  type ConversationListItem,
  type InboxCounts,
  type InboxFilter,
  type Snippet,
  type ThreadData,
} from "@/components/inbox/types";

export const metadata = { title: "Inbox" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function filterWhere(f: InboxFilter): SQL | undefined {
  switch (f) {
    case "unread":
      return and(eq(conversations.unread, true), ne(conversations.status, "closed"));
    case "interested":
      return eq(conversations.status, "interested");
    case "closed":
      return eq(conversations.status, "closed");
    default:
      return ne(conversations.status, "closed");
  }
}

async function loadThread(id: string): Promise<ThreadData | null> {
  const convo = await db.query.conversations.findFirst({
    where: eq(conversations.id, id),
    with: { client: true },
  });
  if (!convo) return null;
  const [msgs, seqs, suppressed] = await Promise.all([
    db
      .select({
        id: messages.id,
        direction: messages.direction,
        channel: messages.channel,
        fromEmail: messages.fromEmail,
        toEmail: messages.toEmail,
        subject: messages.subject,
        bodyText: messages.bodyText,
        bodyHtml: messages.bodyHtml,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .where(eq(messages.conversationId, id))
      .orderBy(asc(messages.createdAt))
      .limit(500),
    db
      .select({ id: sequences.id, name: sequences.name })
      .from(sequenceEnrollments)
      .innerJoin(sequences, eq(sequences.id, sequenceEnrollments.sequenceId))
      .where(and(eq(sequenceEnrollments.clientId, convo.clientId), eq(sequenceEnrollments.status, "active"))),
    db.query.suppressions.findFirst({ where: eq(suppressions.email, convo.client.email.toLowerCase()) }),
  ]);
  return {
    id: convo.id,
    subject: convo.subject,
    status: convo.status,
    unread: convo.unread,
    client: {
      id: convo.client.id,
      name: convo.client.name,
      email: convo.client.email,
      company: convo.client.company,
      status: convo.client.status,
    },
    sequences: seqs,
    suppressed: !!suppressed,
    messages: msgs,
  };
}

export default async function InboxPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const sp = await searchParams;
  const selectedId = one(sp.c) || null;
  const rawFilter = one(sp.f) as InboxFilter | undefined;
  const filter: InboxFilter = rawFilter && INBOX_FILTERS.includes(rawFilter) ? rawFilter : "all";
  const q = (one(sp.q) ?? "").trim().slice(0, 100);
  const composeId = one(sp.compose);

  const where: (SQL | undefined)[] = [filterWhere(filter)];
  if (q) {
    const pattern = `%${q.replace(/[\\%_]/g, (m) => "\\" + m)}%`;
    where.push(
      or(
        ilike(clients.name, pattern),
        ilike(clients.email, pattern),
        ilike(clients.company, pattern),
        ilike(conversations.subject, pattern),
        sql`exists (select 1 from ${messages} where ${messages.conversationId} = ${conversations.id} and ${messages.bodyText} ilike ${pattern})`,
      ),
    );
  }

  const [rows, [counts], thread, snippetRow, composeClient] = await Promise.all([
    db
      .select({
        id: conversations.id,
        subject: conversations.subject,
        status: conversations.status,
        unread: conversations.unread,
        lastMessageAt: conversations.lastMessageAt,
        preview: conversations.lastMessagePreview,
        direction: conversations.lastMessageDirection,
        clientId: clients.id,
        clientName: clients.name,
        clientEmail: clients.email,
        clientCompany: clients.company,
      })
      .from(conversations)
      .innerJoin(clients, eq(clients.id, conversations.clientId))
      .where(and(...where))
      .orderBy(desc(conversations.lastMessageAt))
      .limit(300),
    db
      .select({
        all: sql<number>`(count(*) filter (where ${conversations.status} <> 'closed'))::int`,
        unread: sql<number>`(count(*) filter (where ${conversations.unread} and ${conversations.status} <> 'closed'))::int`,
        interested: sql<number>`(count(*) filter (where ${conversations.status} = 'interested'))::int`,
        closed: sql<number>`(count(*) filter (where ${conversations.status} = 'closed'))::int`,
      })
      .from(conversations),
    selectedId ? loadThread(selectedId) : Promise.resolve(null),
    db.query.settings.findFirst({ where: eq(settings.key, "snippets") }),
    composeId
      ? db.query.clients.findFirst({
          where: eq(clients.id, composeId),
          columns: { id: true, name: true, email: true, company: true },
        })
      : Promise.resolve(undefined),
  ]);

  const list: ConversationListItem[] = rows.map((r) => ({
    id: r.id,
    subject: r.subject,
    status: r.status,
    unread: r.unread,
    lastMessageAt: r.lastMessageAt,
    preview: r.preview,
    direction: r.direction,
    client: { id: r.clientId, name: r.clientName, email: r.clientEmail, company: r.clientCompany },
  }));

  const snippets = Array.isArray(snippetRow?.value) ? (snippetRow.value as Snippet[]) : DEFAULT_SNIPPETS;

  return (
    <InboxView
      filter={filter}
      query={q}
      selectedId={selectedId}
      list={list}
      counts={(counts ?? { all: 0, unread: 0, interested: 0, closed: 0 }) as InboxCounts}
      thread={thread}
      snippets={snippets}
      composeClient={(composeClient as ClientOption | undefined) ?? null}
    />
  );
}
