"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, Inbox as InboxIcon, Loader2, MailPlus, MessageSquareDashed, Search, Star, CircleDot, X } from "lucide-react";
import { Avatar, Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { ThreadPane } from "./thread";
import { NewMessageDialog } from "./new-message";
import { shortTime } from "./text";
import type { ClientOption, ConversationListItem, InboxCounts, InboxFilter, Snippet, ThreadData } from "./types";

const FILTERS: { key: InboxFilter; label: string; icon: typeof InboxIcon }[] = [
  { key: "all", label: "Conversations", icon: InboxIcon },
  { key: "unread", label: "Unread", icon: CircleDot },
  { key: "interested", label: "Interested", icon: Star },
  { key: "closed", label: "Closed", icon: Archive },
];

const POLL_MS = 15_000;

export function InboxView({
  filter,
  query,
  selectedId,
  list,
  counts,
  thread,
  snippets,
  composeClient,
}: {
  filter: InboxFilter;
  query: string;
  selectedId: string | null;
  list: ConversationListItem[];
  counts: InboxCounts;
  thread: ThreadData | null;
  snippets: Snippet[];
  composeClient: ClientOption | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [activeId, setActiveId] = React.useOptimistic(selectedId);
  const [search, setSearch] = React.useState(query);
  const [composeOpen, setComposeOpen] = React.useState(!!composeClient);

  const href = React.useCallback(
    (patch: { f?: InboxFilter; q?: string; c?: string | null }) => {
      const p = new URLSearchParams();
      const f = patch.f ?? filter;
      const q = patch.q ?? query;
      const c = patch.c === undefined ? selectedId : patch.c;
      if (f !== "all") p.set("f", f);
      if (q) p.set("q", q);
      if (c) p.set("c", c);
      const s = p.toString();
      return s ? `/inbox?${s}` : "/inbox";
    },
    [filter, query, selectedId],
  );

  const go = React.useCallback(
    (to: string, opts: { replace?: boolean; id?: string | null } = {}) => {
      startTransition(() => {
        if (opts.id !== undefined) setActiveId(opts.id);
        if (opts.replace) router.replace(to, { scroll: false });
        else router.push(to, { scroll: false });
      });
    },
    [router, setActiveId],
  );

  // Debounced search → URL (server does the filtering so it scales).
  React.useEffect(() => {
    const q = search.trim();
    if (q === query) return;
    const t = setTimeout(() => go(href({ q }), { replace: true }), 300);
    return () => clearTimeout(t);
  }, [search, query, go, href]);

  // Lightweight polling for new messages while the tab is visible.
  React.useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const id = window.setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router]);

  const closeCompose = () => {
    setComposeOpen(false);
    if (composeClient) router.replace(href({}), { scroll: false });
  };

  const openItem = (e: React.MouseEvent, id: string) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    go(href({ c: id }), { id });
  };

  const showThread = !!activeId;

  return (
    <div className="flex h-[calc(100dvh-57px)] bg-surface md:h-dvh">
      {/* Filters */}
      <aside className="hidden w-56 shrink-0 flex-col border-r border-border lg:flex" aria-label="Inbox folders">
        <div className="px-4 pb-3 pt-5">
          <h1 className="text-[17px] font-semibold">Inbox</h1>
        </div>
        <div className="px-3 pb-3">
          <Button className="w-full justify-center" onClick={() => setComposeOpen(true)}>
            <MailPlus className="h-4 w-4" /> New message
          </Button>
        </div>
        <nav className="flex flex-col gap-0.5 px-3">
          {FILTERS.map(({ key, label, icon: Icon }) => {
            const active = filter === key;
            return (
              <Link
                key={key}
                href={href({ f: key, c: null })}
                scroll={false}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-[14px] transition-colors",
                  active ? "bg-brand-50 font-medium text-foreground" : "text-foreground/80 hover:bg-black/[.04]",
                )}
              >
                <Icon className={cn("h-4 w-4", active ? "text-brand" : "text-muted")} />
                <span className="flex-1">{label}</span>
                <span
                  className={cn(
                    "min-w-6 rounded-full px-1.5 text-center text-[11px] font-semibold tabular-nums",
                    key === "unread" && counts.unread > 0 ? "bg-brand text-white" : "text-muted",
                  )}
                >
                  {counts[key]}
                </span>
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* List */}
      <section
        className={cn(
          "min-w-0 flex-col border-r border-border md:flex md:w-80 md:shrink-0 xl:w-96",
          showThread ? "hidden" : "flex w-full",
        )}
        aria-label="Conversations"
      >
        <div className="space-y-3 border-b border-border px-4 pb-3 pt-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[15px] font-semibold lg:hidden">Inbox</h2>
            <h2 className="hidden text-[15px] font-semibold lg:block">{FILTERS.find((f) => f.key === filter)!.label}</h2>
            <div className="flex items-center gap-2">
              {pending && <Loader2 className="h-4 w-4 animate-spin text-muted" aria-label="Loading" />}
              <Button size="sm" className="lg:hidden" onClick={() => setComposeOpen(true)}>
                <MailPlus className="h-4 w-4" /> New
              </Button>
            </div>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, email, subject, message…"
              aria-label="Search conversations"
              className="h-9 w-full rounded-lg border border-border bg-surface-2 pl-9 pr-8 text-sm outline-none placeholder:text-muted/70 focus:border-brand focus:bg-surface focus:ring-3 focus:ring-brand/15 [&::-webkit-search-cancel-button]:hidden"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {/* Filter chips for small screens */}
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 lg:hidden">
            {FILTERS.map(({ key, label }) => (
              <Link
                key={key}
                href={href({ f: key, c: null })}
                scroll={false}
                aria-current={filter === key ? "page" : undefined}
                className={cn(
                  "shrink-0 rounded-full border px-3 py-1 text-xs font-medium",
                  filter === key ? "border-brand bg-brand-50 text-brand-600" : "border-border text-muted hover:text-foreground",
                )}
              >
                {label} <span className="tabular-nums opacity-70">{counts[key]}</span>
              </Link>
            ))}
          </div>
        </div>

        <ul className="scroll-thin flex-1 overflow-y-auto" role="list">
          {list.length === 0 ? (
            <li>
              <ListEmpty filter={filter} query={query} />
            </li>
          ) : (
            list.map((c) => (
              <li key={c.id}>
                <ConversationRow item={c} href={href({ c: c.id })} active={c.id === activeId} onOpen={openItem} />
              </li>
            ))
          )}
        </ul>
      </section>

      {/* Thread */}
      <section className={cn("min-w-0 flex-1 flex-col bg-background/60", showThread ? "flex" : "hidden md:flex")} aria-label="Conversation">
        {thread && thread.id === selectedId ? (
          <ThreadPane
            key={thread.id}
            thread={thread}
            snippets={snippets}
            loading={pending && activeId !== selectedId}
            onBack={() => go(href({ c: null }), { id: null })}
            onLeave={() => go(href({ c: null }), { id: null, replace: true })}
          />
        ) : selectedId && !pending ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
            <p className="font-semibold">Conversation not found</p>
            <p className="text-sm text-muted">It may have been deleted.</p>
            <Button variant="outline" size="sm" onClick={() => go(href({ c: null }), { id: null })}>
              Back to inbox
            </Button>
          </div>
        ) : activeId ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted" aria-label="Loading conversation" />
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
            <div className="mb-2 grid h-12 w-12 place-items-center rounded-full bg-brand-50 text-brand">
              <MessageSquareDashed className="h-6 w-6" />
            </div>
            <p className="font-semibold">Select a conversation</p>
            <p className="max-w-xs text-sm text-muted">Replies to your emails, follow-ups and portal messages all land here.</p>
          </div>
        )}
      </section>

      <NewMessageDialog
        open={composeOpen}
        onClose={closeCompose}
        initialClient={composeClient}
        snippets={snippets}
        onSent={(id) => {
          setComposeOpen(false);
          go(`/inbox?c=${encodeURIComponent(id)}`, { id });
        }}
      />
    </div>
  );
}

function ConversationRow({
  item,
  href,
  active,
  onOpen,
}: {
  item: ConversationListItem;
  href: string;
  active: boolean;
  onOpen: (e: React.MouseEvent, id: string) => void;
}) {
  const unread = item.unread && !active;
  const preview = item.preview ? (item.direction === "out" ? `You: ${item.preview}` : item.preview) : "No messages yet";
  return (
    <Link
      href={href}
      scroll={false}
      onClick={(e) => onOpen(e, item.id)}
      aria-current={active ? "true" : undefined}
      className={cn(
        "flex gap-3 border-b border-l-[3px] border-b-border px-4 py-3 transition-colors",
        active ? "border-l-brand bg-brand-50/70" : "border-l-transparent hover:bg-surface-2",
      )}
    >
      <div className="relative">
        <Avatar name={item.client.name} size={40} />
        {unread && <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-surface bg-brand" aria-label="Unread" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className={cn("truncate text-[14px]", unread ? "font-bold" : "font-medium")}>{item.client.name}</p>
          <time
            dateTime={item.lastMessageAt.toISOString()}
            title={item.lastMessageAt.toLocaleString()}
            suppressHydrationWarning
            className={cn("shrink-0 text-[11px] tabular-nums", unread ? "font-semibold text-brand" : "text-muted")}
          >
            {shortTime(item.lastMessageAt)}
          </time>
        </div>
        <div className="flex items-center gap-1.5">
          <p className={cn("min-w-0 flex-1 truncate text-[13px]", unread ? "font-semibold text-foreground" : "text-foreground/80")}>
            {item.subject || "(no subject)"}
          </p>
          {item.status === "interested" && <Star className="h-3.5 w-3.5 shrink-0 fill-brand text-brand" aria-label="Interested" />}
        </div>
        <p className={cn("truncate text-[13px]", unread ? "text-foreground/80" : "text-muted")}>{preview}</p>
      </div>
    </Link>
  );
}

function ListEmpty({ filter, query }: { filter: InboxFilter; query: string }) {
  const copy = query
    ? { title: "No matches", text: `Nothing matches “${query}”. Try a name, email or a phrase from the message.` }
    : filter === "unread"
      ? { title: "All caught up", text: "You've read every conversation. Nice." }
      : filter === "interested"
        ? { title: "No interested leads yet", text: "Mark a conversation as Interested to keep hot leads here." }
        : filter === "closed"
          ? { title: "Nothing closed", text: "Closed conversations are archived here." }
          : { title: "No conversations yet", text: "Send a message or a campaign — replies will show up here." };
  return (
    <div className="flex flex-col items-center gap-1.5 px-6 py-16 text-center">
      <p className="font-semibold">{copy.title}</p>
      <p className="max-w-xs text-sm text-muted">{copy.text}</p>
    </div>
  );
}
