"use client";

import * as React from "react";
import { Braces, Check, MessageSquareText, Pencil, Plus, Settings2, Trash2 } from "lucide-react";
import { Button, Input, Textarea } from "@/components/ui";
import { saveSnippets } from "@/app/(admin)/inbox/actions";
import { cn } from "@/lib/utils";
import { MenuItem, Popover } from "./overlay";
import { MERGE_TAGS, type Snippet } from "./types";

/** Insert text at the caret of a controlled textarea. */
export function insertAtCursor(
  el: HTMLTextAreaElement | null,
  value: string,
  setValue: (v: string) => void,
  text: string,
  opts: { replaceIfEmpty?: boolean } = {},
) {
  if (opts.replaceIfEmpty && !value.trim()) {
    setValue(text);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(text.length, text.length);
    });
    return;
  }
  const start = el?.selectionStart ?? value.length;
  const end = el?.selectionEnd ?? value.length;
  const next = value.slice(0, start) + text + value.slice(end);
  setValue(next);
  requestAnimationFrame(() => {
    el?.focus();
    const pos = start + text.length;
    el?.setSelectionRange(pos, pos);
  });
}

const toolBtn =
  "inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-muted transition-colors hover:bg-black/5 hover:text-foreground aria-expanded:bg-black/5 aria-expanded:text-foreground";

export function MergeTagMenu({ onInsert, side = "top" }: { onInsert: (tag: string) => void; side?: "top" | "bottom" }) {
  return (
    <Popover
      side={side}
      align="left"
      trigger={({ toggle, ...aria }) => (
        <button type="button" className={toolBtn} onClick={toggle} title="Insert merge tag" {...aria}>
          <Braces className="h-4 w-4" />
          <span className="hidden sm:inline">Merge tags</span>
        </button>
      )}
    >
      {(close) => (
        <div role="menu" className="w-60">
          <p className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Personalize</p>
          {MERGE_TAGS.map((t) => (
            <MenuItem
              key={t.tag}
              onClick={() => {
                onInsert(t.tag);
                close();
              }}
            >
              <span className="flex-1">{t.label}</span>
              <code className="text-[11px] text-muted">{t.tag}</code>
            </MenuItem>
          ))}
          <p className="px-2.5 pb-1.5 pt-1 text-[11px] text-muted">
            Add a fallback: <code>{"{{first_name|there}}"}</code>
          </p>
        </div>
      )}
    </Popover>
  );
}

export function SnippetPicker({
  snippets: initial,
  onInsert,
  side = "top",
}: {
  snippets: Snippet[];
  onInsert: (body: string) => void;
  side?: "top" | "bottom";
}) {
  const [open, setOpen] = React.useState(false);
  const [list, setList] = React.useState(initial);
  const [managing, setManaging] = React.useState(false);
  const [editing, setEditing] = React.useState<Snippet | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, startSaving] = React.useTransition();
  const [filter, setFilter] = React.useState("");

  // Keep in sync when the server sends a fresh list (another tab saved).
  const [prevInitial, setPrevInitial] = React.useState(initial);
  if (initial !== prevInitial) {
    setPrevInitial(initial);
    setList(initial);
  }

  const persist = (next: Snippet[], after?: () => void) => {
    setError(null);
    startSaving(async () => {
      const res = await saveSnippets(next);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setList(res.data);
      after?.();
    });
  };

  const handleOpen = (v: boolean) => {
    setOpen(v);
    if (!v) {
      setManaging(false);
      setEditing(null);
      setError(null);
      setFilter("");
    }
  };

  const shown = list.filter(
    (s) => !filter || s.title.toLowerCase().includes(filter.toLowerCase()) || s.body.toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <Popover
      side={side}
      align="left"
      open={open}
      onOpenChange={handleOpen}
      className="w-[min(22rem,calc(100vw-2rem))] p-0"
      trigger={({ toggle, ...aria }) => (
        <button type="button" className={toolBtn} onClick={toggle} title="Quick replies" {...aria}>
          <MessageSquareText className="h-4 w-4" />
          <span className="hidden sm:inline">Snippets</span>
        </button>
      )}
    >
      {editing ? (
        // Not a <form>: this popover is rendered inside the composer's form.
        <div
          className="space-y-3 p-3"
          onKeyDown={(e) => {
            // Keep Enter in the title field from submitting the surrounding composer form.
            if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") e.preventDefault();
          }}
        >
          <p className="text-[13px] font-semibold">{list.some((s) => s.id === editing.id) ? "Edit snippet" : "New snippet"}</p>
          <Input
            autoFocus
            value={editing.title}
            onChange={(e) => setEditing({ ...editing, title: e.target.value })}
            placeholder="Title, e.g. “Book a call”"
            aria-label="Snippet title"
            maxLength={80}
          />
          <Textarea
            value={editing.body}
            onChange={(e) => setEditing({ ...editing, body: e.target.value })}
            placeholder={"Hi {{first_name}},\n\n…"}
            aria-label="Snippet text"
            className="min-h-32 text-[13px]"
          />
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={saving || !editing.title.trim()}
              onClick={() => {
                const exists = list.some((s) => s.id === editing.id);
                const next = exists ? list.map((s) => (s.id === editing.id ? editing : s)) : [...list, editing];
                persist(next, () => setEditing(null));
              }}
            >
              <Check className="h-3.5 w-3.5" /> Save
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
            <p className="text-[13px] font-semibold">{managing ? "Manage snippets" : "Quick replies"}</p>
            <button
              type="button"
              onClick={() => setManaging((m) => !m)}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-muted hover:bg-black/5 hover:text-foreground"
            >
              {managing ? (
                "Done"
              ) : (
                <>
                  <Settings2 className="h-3.5 w-3.5" /> Manage
                </>
              )}
            </button>
          </div>
          {list.length > 5 && !managing && (
            <div className="border-b border-border p-2">
              <input
                autoFocus
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (shown[0]) {
                      onInsert(shown[0].body);
                      handleOpen(false);
                    }
                  }
                }}
                placeholder="Filter snippets…"
                aria-label="Filter snippets"
                className="h-8 w-full rounded-md border border-border bg-surface-2 px-2.5 text-[13px] outline-none focus:border-brand"
              />
            </div>
          )}
          <div className="scroll-thin max-h-72 overflow-y-auto p-1" role="menu">
            {shown.length === 0 && <p className="px-3 py-6 text-center text-[13px] text-muted">No snippets yet.</p>}
            {shown.map((s) =>
              managing ? (
                <div key={s.id} className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 hover:bg-black/[.03]">
                  <p className="min-w-0 flex-1 truncate text-[13px]">{s.title}</p>
                  <button
                    type="button"
                    onClick={() => setEditing(s)}
                    className="rounded p-1 text-muted hover:bg-black/5 hover:text-foreground"
                    aria-label={`Edit ${s.title}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => persist(list.filter((x) => x.id !== s.id))}
                    className="rounded p-1 text-muted hover:bg-red-50 hover:text-danger"
                    aria-label={`Delete ${s.title}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  key={s.id}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onInsert(s.body);
                    handleOpen(false);
                  }}
                  className="block w-full rounded-lg px-2.5 py-2 text-left hover:bg-black/[.04]"
                >
                  <p className="text-[13px] font-medium">{s.title}</p>
                  <p className="line-clamp-2 text-xs text-muted">{s.body}</p>
                </button>
              ),
            )}
          </div>
          {error && <p className="px-3 pb-2 text-xs text-danger">{error}</p>}
          <div className={cn("border-t border-border p-1")}>
            <MenuItem icon={<Plus />} onClick={() => setEditing({ id: crypto.randomUUID().slice(0, 8), title: "", body: "" })}>
              New snippet
            </MenuItem>
          </div>
        </div>
      )}
    </Popover>
  );
}
