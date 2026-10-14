"use client";

import * as React from "react";
import { Loader2, Lock, Send, StickyNote } from "lucide-react";
import { Button } from "@/components/ui";
import { sendReply } from "@/app/(admin)/inbox/actions";
import { cn } from "@/lib/utils";
import { insertAtCursor, MergeTagMenu, SnippetPicker } from "./snippets";
import type { Snippet } from "./types";

const draftKey = (id: string) => `inbox-draft:${id}`;

function readDraft(id: string) {
  try {
    return sessionStorage.getItem(draftKey(id)) ?? "";
  } catch {
    return "";
  }
}
function writeDraft(id: string, v: string) {
  try {
    if (v) sessionStorage.setItem(draftKey(id), v);
    else sessionStorage.removeItem(draftKey(id));
  } catch {
    /* storage unavailable */
  }
}

export function Composer({
  conversationId,
  clientName,
  snippets,
  suppressed,
}: {
  conversationId: string;
  clientName: string;
  snippets: Snippet[];
  suppressed: boolean;
}) {
  const [body, setBody] = React.useState("");
  const [note, setNote] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const ref = React.useRef<HTMLTextAreaElement>(null);
  const [isMac, setIsMac] = React.useState(true);

  // Restore an unsent draft for this conversation (client-only storage).
  React.useEffect(() => {
    const d = readDraft(conversationId);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from sessionStorage after mount
    if (d) setBody(d);
    setIsMac(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent));
  }, [conversationId]);

  const update = (v: string) => {
    setBody(v);
    writeDraft(conversationId, v);
  };

  const submit = () => {
    if (!body.trim() || pending) return;
    setError(null);
    const text = body;
    startTransition(async () => {
      const res = await sendReply({ conversationId, body: text, note });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      update("");
      ref.current?.focus();
    });
  };

  const blocked = suppressed && !note;

  return (
    <div className="border-t border-border bg-surface px-3 pb-3 pt-2 sm:px-4">
      <div role="tablist" aria-label="Message type" className="mb-2 flex gap-1">
        {[
          { key: false, label: "Reply", icon: Send },
          { key: true, label: "Internal note", icon: StickyNote },
        ].map((t) => (
          <button
            key={String(t.key)}
            type="button"
            role="tab"
            aria-selected={note === t.key}
            onClick={() => {
              setNote(t.key);
              ref.current?.focus();
            }}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              note === t.key
                ? t.key
                  ? "bg-amber-100 text-amber-800"
                  : "bg-brand-50 text-brand-600"
                : "text-muted hover:bg-black/5 hover:text-foreground",
            )}
          >
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className={cn(
          "rounded-xl border transition-colors focus-within:ring-3",
          note
            ? "border-amber-300 bg-amber-50/70 focus-within:ring-amber-200/60"
            : "border-border bg-surface focus-within:border-brand focus-within:ring-brand/15",
        )}
      >
        <label htmlFor={`composer-${conversationId}`} className="sr-only">
          {note ? "Internal note" : `Reply to ${clientName}`}
        </label>
        <textarea
          id={`composer-${conversationId}`}
          ref={ref}
          value={body}
          onChange={(e) => update(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            }
          }}
          rows={3}
          placeholder={
            note ? "Add an internal note — only your team can see this…" : blocked ? "This address is suppressed — email is disabled." : `Reply to ${clientName}…`
          }
          disabled={blocked}
          className="block max-h-64 min-h-20 w-full resize-none bg-transparent px-3.5 py-3 text-sm outline-none [field-sizing:content] placeholder:text-muted/70 disabled:cursor-not-allowed"
        />
        <div className="flex flex-wrap items-center gap-1 border-t border-black/5 px-2 py-1.5">
          <SnippetPicker snippets={snippets} onInsert={(t) => insertAtCursor(ref.current, body, update, t, { replaceIfEmpty: true })} />
          <MergeTagMenu onInsert={(t) => insertAtCursor(ref.current, body, update, t)} />
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-[11px] text-muted sm:inline">
              <kbd className="font-sans">{isMac ? "⌘" : "Ctrl"}</kbd> + <kbd className="font-sans">Enter</kbd> to {note ? "save" : "send"}
            </span>
            <Button
              type="submit"
              size="sm"
              disabled={!body.trim() || pending || blocked}
              className={cn(note && "bg-amber-500 hover:bg-amber-600")}
            >
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : note ? <Lock className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}
              {note ? "Add note" : "Send"}
            </Button>
          </div>
        </div>
      </form>
      {error && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
