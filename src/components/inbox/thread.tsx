"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  ArrowLeft,
  ExternalLink,
  Globe,
  Loader2,
  Mail,
  MailQuestion,
  MoreHorizontal,
  StickyNote,
  Star,
  Workflow,
} from "lucide-react";
import { Avatar, Badge } from "@/components/ui";
import { markConversationRead, markConversationUnread, setConversationStatus } from "@/app/(admin)/inbox/actions";
import { statusTone } from "@/lib/status";
import { cn } from "@/lib/utils";
import { Composer } from "./composer";
import { MenuItem, Popover } from "./overlay";
import { clockTime, dayLabel, messageText, splitQuoted } from "./text";
import type { ConversationStatus, Snippet, ThreadData, ThreadMessage } from "./types";

export function ThreadPane({
  thread,
  snippets,
  loading,
  onBack,
  onLeave,
}: {
  thread: ThreadData;
  snippets: Snippet[];
  loading: boolean;
  onBack: () => void;
  onLeave: () => void;
}) {
  const [status, setStatus] = React.useOptimistic(thread.status);
  const [busy, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const { client } = thread;

  // Opening a conversation (or a new message arriving while it's open) marks it read.
  const leaving = React.useRef(false);
  React.useEffect(() => {
    if (thread.unread && !leaving.current) void markConversationRead(thread.id);
  }, [thread.id, thread.unread, thread.messages.length]);

  // Stick to the bottom on open and when new messages arrive.
  const count = thread.messages.length;
  React.useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [count]);

  const changeStatus = (next: ConversationStatus) => {
    setError(null);
    startTransition(async () => {
      setStatus(next);
      const res = await setConversationStatus(thread.id, next);
      if (!res.ok) setError(res.error);
    });
  };

  const markUnread = () => {
    leaving.current = true;
    startTransition(async () => {
      const res = await markConversationUnread(thread.id);
      if (!res.ok) {
        leaving.current = false;
        setError(res.error);
      } else onLeave();
    });
  };

  const groups = React.useMemo(() => groupByDay(thread.messages), [thread.messages]);

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col transition-opacity", loading && "opacity-60")} aria-busy={loading}>
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-border bg-surface px-3 py-3 sm:px-5">
        <button
          type="button"
          onClick={onBack}
          className="-ml-1 rounded-lg p-1.5 text-muted hover:bg-black/5 hover:text-foreground md:hidden"
          aria-label="Back to conversations"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <Avatar name={client.name} size={40} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <Link href={`/clients/${client.id}`} className="truncate text-[15px] font-semibold hover:text-brand hover:underline">
              {client.name}
            </Link>
            <Badge tone={statusTone(client.status)}>{client.status}</Badge>
            {status !== "open" && (
              <Badge tone={statusTone(status)}>
                {status === "interested" && <Star className="h-3 w-3 fill-current" />}
                {status}
              </Badge>
            )}
          </div>
          <p className="truncate text-[13px] text-muted">
            {client.company ? `${client.company} · ` : ""}
            {client.email}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {busy && <Loader2 className="h-4 w-4 animate-spin text-muted" aria-label="Saving" />}
          <button
            type="button"
            onClick={() => changeStatus(status === "interested" ? "open" : "interested")}
            aria-pressed={status === "interested"}
            title={status === "interested" ? "Remove from Interested" : "Mark as Interested"}
            className={cn(
              "hidden h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[13px] font-medium transition-colors sm:inline-flex",
              status === "interested"
                ? "border-brand/30 bg-brand-50 text-brand-600"
                : "border-border text-foreground/80 hover:bg-surface-2",
            )}
          >
            <Star className={cn("h-3.5 w-3.5", status === "interested" && "fill-current")} />
            Interested
          </button>
          <Popover
            trigger={({ toggle, ...aria }) => (
              <button
                type="button"
                onClick={toggle}
                aria-label="Conversation actions"
                className="rounded-lg p-2 text-muted hover:bg-black/5 hover:text-foreground aria-expanded:bg-black/5"
                {...aria}
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            )}
          >
            {(close) => (
              <div role="menu">
                <MenuItem
                  icon={<Star />}
                  onClick={() => {
                    close();
                    changeStatus(status === "interested" ? "open" : "interested");
                  }}
                >
                  {status === "interested" ? "Remove from Interested" : "Mark as Interested"}
                </MenuItem>
                <MenuItem
                  icon={status === "closed" ? <ArchiveRestore /> : <Archive />}
                  onClick={() => {
                    close();
                    changeStatus(status === "closed" ? "open" : "closed");
                  }}
                >
                  {status === "closed" ? "Reopen conversation" : "Close conversation"}
                </MenuItem>
                <MenuItem
                  icon={<MailQuestion />}
                  onClick={() => {
                    close();
                    markUnread();
                  }}
                >
                  Mark as unread
                </MenuItem>
                <div className="my-1 border-t border-border" />
                <Link
                  href={`/clients/${client.id}`}
                  role="menuitem"
                  className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] hover:bg-black/[.04]"
                >
                  <ExternalLink className="h-4 w-4 text-muted" /> View client profile
                </Link>
              </div>
            )}
          </Popover>
        </div>
      </header>

      {/* Context strip */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border bg-surface px-4 py-2 text-[12px] text-muted sm:px-5">
        <span className="min-w-0 truncate font-medium text-foreground/80">{thread.subject || "(no subject)"}</span>
        {thread.sequences.map((s) => (
          <Link
            key={s.id}
            href={`/automations/${s.id}`}
            className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-2 py-0.5 font-medium text-purple-700 hover:underline"
          >
            <Workflow className="h-3 w-3" /> {s.name}
          </Link>
        ))}
      </div>
      {thread.suppressed && (
        <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-5 py-2 text-[13px] text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {client.email} is on the suppression list (bounced, complained or unsubscribed). Email replies are disabled.
        </div>
      )}
      {error && (
        <div role="alert" className="border-b border-red-200 bg-red-50 px-5 py-2 text-[13px] text-red-700">
          {error}
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="scroll-thin min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-6" aria-live="polite">
        {thread.messages.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted">No messages in this conversation yet.</p>
        ) : (
          groups.map((g) => (
            <div key={g.key} className="space-y-3">
              <div className="sticky top-0 z-10 flex justify-center py-2">
                <span
                  className="rounded-full border border-border bg-surface px-2.5 py-0.5 text-[11px] font-medium text-muted shadow-sm"
                  suppressHydrationWarning
                >
                  {dayLabel(g.date)}
                </span>
              </div>
              {g.items.map((m) => (
                <MessageBubble key={m.id} m={m} clientName={client.name} />
              ))}
            </div>
          ))
        )}
      </div>

      <Composer conversationId={thread.id} clientName={client.name} snippets={snippets} suppressed={thread.suppressed} />
    </div>
  );
}

function groupByDay(messages: ThreadMessage[]) {
  const out: { key: string; date: Date; items: ThreadMessage[] }[] = [];
  for (const m of messages) {
    const key = m.createdAt.toDateString();
    const last = out[out.length - 1];
    if (last && last.key === key) last.items.push(m);
    else out.push({ key, date: m.createdAt, items: [m] });
  }
  return out;
}

const URL_RE = /(https?:\/\/[^\s<>"')\]]+[^\s<>"')\].,;:!?])/g;

function Linkified({ text }: { text: string }) {
  const parts = text.split(URL_RE);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <a key={i} href={p} target="_blank" rel="noopener noreferrer nofollow" className="break-all underline underline-offset-2 hover:opacity-80">
            {p}
          </a>
        ) : (
          <React.Fragment key={i}>{p}</React.Fragment>
        ),
      )}
    </>
  );
}

const CHANNEL = {
  email: { icon: Mail, label: "Email" },
  portal: { icon: Globe, label: "Portal" },
  note: { icon: StickyNote, label: "Internal note" },
} as const;

function MessageBubble({ m, clientName }: { m: ThreadMessage; clientName: string }) {
  const [showQuoted, setShowQuoted] = React.useState(false);
  const full = React.useMemo(() => messageText(m), [m]);
  const { main, hasQuoted } = React.useMemo(
    () => (m.direction === "in" ? splitQuoted(full) : { main: full.trim(), hasQuoted: false }),
    [full, m.direction],
  );
  const isNote = m.channel === "note";
  const outbound = m.direction === "out";
  const ch = CHANNEL[m.channel];

  return (
    <div className={cn("flex", outbound ? "justify-end" : "justify-start")}>
      <div className={cn("flex max-w-[88%] flex-col sm:max-w-[75%]", outbound ? "items-end" : "items-start")}>
        <div
          className={cn(
            "rounded-2xl border px-4 py-2.5 text-[14px] leading-relaxed",
            isNote
              ? "rounded-br-md border-amber-200 bg-amber-50 text-amber-950"
              : outbound
                ? "rounded-br-md border-brand-100 bg-brand-50 text-foreground"
                : "rounded-bl-md border-transparent bg-black/[.05] text-foreground",
          )}
        >
          {isNote && (
            <p className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
              <StickyNote className="h-3 w-3" /> Internal note
            </p>
          )}
          <div className="whitespace-pre-wrap break-words">
            <Linkified text={showQuoted ? full.trim() : main || "(empty message)"} />
          </div>
          {hasQuoted && (
            <button
              type="button"
              onClick={() => setShowQuoted((v) => !v)}
              aria-expanded={showQuoted}
              className="mt-1.5 inline-flex items-center rounded-md bg-black/5 px-2 py-0.5 text-[11px] font-medium text-muted hover:bg-black/10 hover:text-foreground"
            >
              {showQuoted ? "Hide quoted text" : "••• Show quoted text"}
            </button>
          )}
        </div>
        <p className="mt-1 flex items-center gap-1.5 px-1 text-[11px] text-muted">
          {!isNote && <ch.icon className="h-3 w-3" aria-hidden />}
          <span>{isNote ? "Note" : outbound ? "You" : m.fromEmail && m.channel === "email" ? m.fromEmail : clientName}</span>
          {!isNote && <span aria-hidden>·</span>}
          {!isNote && <span>{ch.label}</span>}
          <span aria-hidden>·</span>
          <time dateTime={m.createdAt.toISOString()} title={m.createdAt.toLocaleString()} suppressHydrationWarning>
            {clockTime(m.createdAt)}
          </time>
        </p>
      </div>
    </div>
  );
}
