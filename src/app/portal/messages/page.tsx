import { and, asc, eq, ne } from "drizzle-orm";
import { formatDistanceToNowStrict } from "date-fns";
import { MessageSquare } from "lucide-react";
import { db } from "@/db";
import { conversations, messages } from "@/db/schema";
import { requireClient } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { Avatar, Card } from "@/components/ui";
import { Composer } from "./composer";

export const metadata = { title: "Messages" };

function dayLabel(d: Date) {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(d);
}

export default async function PortalMessages() {
  const { client } = await requireClient();
  if (!client) return null;

  // Always scoped to this client's conversations, and never internal notes.
  const [rows, s] = await Promise.all([
    db
      .select({
        id: messages.id,
        direction: messages.direction,
        channel: messages.channel,
        subject: messages.subject,
        bodyText: messages.bodyText,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .innerJoin(conversations, eq(conversations.id, messages.conversationId))
      .where(and(eq(conversations.clientId, client.id), ne(messages.channel, "note")))
      .orderBy(asc(messages.createdAt))
      .limit(500),
    getSettings(),
  ]);

  let lastDay = "";
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Messages</h1>
        <p className="mt-1 text-sm text-muted">Your conversation with {s.businessName}. We’ll reply here and by email.</p>
      </div>

      <Card className="flex flex-col overflow-hidden">
        {/* column-reverse keeps the scroll pinned to the newest message */}
        <div className="flex max-h-[60vh] min-h-64 flex-col-reverse overflow-y-auto px-4 py-6 sm:px-6">
          <div className="space-y-4" aria-live="polite">
            {rows.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
                <div className="grid h-12 w-12 place-items-center rounded-full bg-brand-50 text-brand">
                  <MessageSquare className="h-5 w-5" />
                </div>
                <p className="font-semibold">No messages yet</p>
                <p className="max-w-sm text-sm text-muted">Questions, change requests, anything at all — send us a note below.</p>
              </div>
            ) : (
              rows.map((m) => {
                const mine = m.direction === "in";
                const day = dayLabel(m.createdAt);
                const showDay = day !== lastDay;
                lastDay = day;
                return (
                  <div key={m.id}>
                    {showDay && (
                      <div className="my-4 flex items-center gap-3 text-xs text-muted">
                        <span className="h-px flex-1 bg-border" />
                        {day}
                        <span className="h-px flex-1 bg-border" />
                      </div>
                    )}
                    <div className={`flex items-end gap-2 ${mine ? "flex-row-reverse" : ""}`}>
                      {!mine && <Avatar name={s.businessName} src={s.logoUrl || undefined} size={28} />}
                      <div className={`max-w-[85%] sm:max-w-[70%] ${mine ? "items-end" : "items-start"} flex flex-col`}>
                        <div
                          className={`whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                            mine ? "rounded-br-md bg-brand text-white" : "rounded-bl-md border border-border bg-surface-2"
                          }`}
                        >
                          {m.subject && !mine && m.channel === "email" && <p className="mb-1 text-xs font-semibold opacity-70">{m.subject}</p>}
                          {m.bodyText}
                        </div>
                        <p className="mt-1 px-1 text-[11px] text-muted">
                          {mine ? "You" : s.businessName} ·{" "}
                          <time dateTime={m.createdAt.toISOString()}>{formatDistanceToNowStrict(m.createdAt, { addSuffix: true })}</time>
                          {m.channel === "email" ? " · via email" : ""}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
        <Composer />
      </Card>
    </div>
  );
}
