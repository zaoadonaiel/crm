"use client";

import { useActionState, useRef, useState } from "react";
import { Send } from "lucide-react";
import { FormMessage, SubmitButton } from "@/components/crm/form-bits";
import { sendPortalMessageAction, type PortalActionState } from "../actions";

export function Composer() {
  const [state, action] = useActionState<PortalActionState, FormData>(sendPortalMessageAction, null);
  const [text, setText] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state?.sentAt) setText("");
  }

  return (
    <form ref={formRef} action={action} className="border-t border-border bg-surface p-3 sm:p-4">
      <label htmlFor="portal-message" className="sr-only">
        Write a message
      </label>
      <div className="flex items-end gap-2">
        <textarea
          id="portal-message"
          name="body"
          rows={2}
          value={text}
          maxLength={5000}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && text.trim()) {
              e.preventDefault();
              formRef.current?.requestSubmit();
            }
          }}
          placeholder="Write a message…"
          className="max-h-48 min-h-11 flex-1 resize-y rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm outline-none transition focus:border-brand focus:ring-3 focus:ring-brand/15"
        />
        <SubmitButton className="h-11" disabled={!text.trim()} pendingText="Sending…" aria-label="Send message">
          <Send className="h-4 w-4" /> <span className="hidden sm:inline">Send</span>
        </SubmitButton>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-[11px] text-muted">⌘/Ctrl + Enter to send</p>
      </div>
      {state?.error && (
        <div className="mt-2">
          <FormMessage state={state} />
        </div>
      )}
    </form>
  );
}
