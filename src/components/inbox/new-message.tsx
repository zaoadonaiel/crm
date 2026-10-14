"use client";

import * as React from "react";
import { Loader2, Search, Send, X } from "lucide-react";
import { Avatar, Button, Field, Input } from "@/components/ui";
import { searchClients, startConversation } from "@/app/(admin)/inbox/actions";
import { cn } from "@/lib/utils";
import { Dialog } from "./overlay";
import { insertAtCursor, MergeTagMenu, SnippetPicker } from "./snippets";
import type { ClientOption, Snippet } from "./types";

export function NewMessageDialog({
  open,
  onClose,
  initialClient,
  snippets,
  onSent,
}: {
  open: boolean;
  onClose: () => void;
  initialClient: ClientOption | null;
  snippets: Snippet[];
  onSent: (conversationId: string) => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} title="New message" description="Start an email conversation with a client." className="max-w-xl">
      {open && <NewMessageForm initialClient={initialClient} snippets={snippets} onSent={onSent} onCancel={onClose} />}
    </Dialog>
  );
}

function NewMessageForm({
  initialClient,
  snippets,
  onSent,
  onCancel,
}: {
  initialClient: ClientOption | null;
  snippets: Snippet[];
  onSent: (id: string) => void;
  onCancel: () => void;
}) {
  const [client, setClient] = React.useState<ClientOption | null>(initialClient);
  const [subject, setSubject] = React.useState("");
  const [body, setBody] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const bodyRef = React.useRef<HTMLTextAreaElement>(null);

  const submit = () => {
    if (pending) return;
    if (!client) return setError("Choose a client first");
    setError(null);
    startTransition(async () => {
      const res = await startConversation({ clientId: client.id, subject, body });
      if (!res.ok) setError(res.error);
      else onSent(res.data.id);
    });
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Field label="To">
        {client ? (
          <div className="flex h-10 items-center gap-2.5 rounded-lg border border-border bg-surface-2 px-2.5">
            <Avatar name={client.name} size={26} />
            <div className="min-w-0 flex-1 truncate text-sm">
              <span className="font-medium">{client.name}</span> <span className="text-muted">&lt;{client.email}&gt;</span>
            </div>
            <button
              type="button"
              onClick={() => setClient(null)}
              className="rounded p-1 text-muted hover:bg-black/5 hover:text-foreground"
              aria-label="Change recipient"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <ClientSearch onPick={setClient} />
        )}
      </Field>
      <Field label="Subject">
        <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Quick question about your website" maxLength={300} required />
      </Field>
      <div>
        <label htmlFor="new-message-body" className="mb-1.5 block text-[13px] font-medium">
          Message
        </label>
        <div className="rounded-lg border border-border focus-within:border-brand focus-within:ring-3 focus-within:ring-brand/15">
          <textarea
            id="new-message-body"
            ref={bodyRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                submit();
              }
            }}
            rows={8}
            placeholder={"Hi {{first_name}},\n\n"}
            className="block min-h-40 w-full resize-y rounded-t-lg bg-transparent px-3 py-2.5 text-sm outline-none placeholder:text-muted/70"
            required
          />
          <div className="flex items-center gap-1 border-t border-black/5 px-1.5 py-1">
            <SnippetPicker snippets={snippets} side="top" onInsert={(t) => insertAtCursor(bodyRef.current, body, setBody, t, { replaceIfEmpty: true })} />
            <MergeTagMenu side="top" onInsert={(t) => insertAtCursor(bodyRef.current, body, setBody, t)} />
          </div>
        </div>
        <p className="mt-1 text-xs text-muted">Your signature from Settings is added automatically. Replies land back in this inbox.</p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending || !client || !subject.trim() || !body.trim()}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Send
        </Button>
      </div>
    </form>
  );
}

function ClientSearch({ onPick }: { onPick: (c: ClientOption) => void }) {
  const [q, setQ] = React.useState("");
  const [results, setResults] = React.useState<ClientOption[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const listId = React.useId();

  React.useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await searchClients(q);
        if (!cancelled) {
          setResults(r);
          setActive(0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q]);

  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <Input
          autoFocus
          role="combobox"
          aria-expanded={results.length > 0}
          aria-controls={listId}
          aria-activedescendant={results[active] ? `${listId}-${results[active].id}` : undefined}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              if (results[active]) onPick(results[active]);
            }
          }}
          placeholder="Search clients by name, email or company…"
          className="pl-9"
        />
        {loading && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted" />}
      </div>
      <ul id={listId} role="listbox" className="mt-1.5 max-h-56 overflow-y-auto rounded-lg border border-border empty:hidden">
        {results.map((c, i) => (
          <li
            key={c.id}
            id={`${listId}-${c.id}`}
            role="option"
            aria-selected={i === active}
            onMouseEnter={() => setActive(i)}
            onMouseDown={(e) => {
              e.preventDefault();
              onPick(c);
            }}
            className={cn("flex cursor-pointer items-center gap-2.5 px-3 py-2", i === active && "bg-brand-50")}
          >
            <Avatar name={c.name} size={28} />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{c.name}</p>
              <p className="truncate text-xs text-muted">
                {c.email}
                {c.company ? ` · ${c.company}` : ""}
              </p>
            </div>
          </li>
        ))}
      </ul>
      {!loading && q && results.length === 0 && <p className="mt-2 text-xs text-muted">No clients match “{q}”. Add them on the Clients page first.</p>}
    </div>
  );
}
