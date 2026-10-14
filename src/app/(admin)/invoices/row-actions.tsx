"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { BellOff, BellRing, Download, ExternalLink, Loader2, Mail, MoreHorizontal, RefreshCw, Ban } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  resendInvoiceAction,
  sendReminderNowAction,
  syncInvoiceAction,
  toggleRemindersAction,
  voidInvoiceAction,
  type InvoiceActionState,
} from "./actions";

export function InvoiceRowActions({
  id,
  status,
  remindersEnabled,
  hostedUrl,
  pdfUrl,
  stripeUrl,
  stripeReady,
}: {
  id: string;
  status: string;
  remindersEnabled: boolean;
  hostedUrl: string | null;
  pdfUrl: string | null;
  stripeUrl: string | null;
  stripeReady: boolean;
}) {
  const [open, setOpen] = useState(false);
  // Fixed positioning so the menu isn't clipped by the table's scroll container.
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<InvoiceActionState>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onScroll = () => setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  const run = (fn: () => Promise<InvoiceActionState>) => {
    setOpen(false);
    start(async () => {
      const r = await fn();
      setResult(r);
      setTimeout(() => setResult(null), 3000);
    });
  };

  const isOpen = status === "open";
  const item = "flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] hover:bg-surface-2 disabled:opacity-50";

  return (
    <div ref={ref} className="relative inline-flex items-center justify-end gap-2">
      {pending && <Loader2 className="h-4 w-4 animate-spin text-muted" aria-label="Working" />}
      {result && (
        <span role="status" className={cn("whitespace-nowrap text-xs", result.error ? "text-danger" : "text-green-700")}>
          {result.error ?? result.message}
        </span>
      )}
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Invoice actions"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const menuH = 320;
          const top = r.bottom + menuH > window.innerHeight ? Math.max(8, r.top - menuH) : r.bottom + 4;
          setPos({ top, left: Math.max(8, r.right - 224) });
          setOpen((o) => !o);
        }}
        className="rounded-md p-1.5 text-muted hover:bg-black/5 hover:text-foreground"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && pos && (
        <div role="menu" style={{ top: pos.top, left: pos.left }} className="fixed z-50 w-56 overflow-hidden rounded-xl border border-border bg-surface py-1 text-foreground shadow-lg">
          {hostedUrl && (
            <a role="menuitem" href={hostedUrl} target="_blank" rel="noopener noreferrer" className={item}>
              <ExternalLink className="h-4 w-4 text-muted" /> View payment page
            </a>
          )}
          {pdfUrl && (
            <a role="menuitem" href={pdfUrl} target="_blank" rel="noopener noreferrer" className={item}>
              <Download className="h-4 w-4 text-muted" /> Download PDF
            </a>
          )}
          {stripeUrl && (
            <a role="menuitem" href={stripeUrl} target="_blank" rel="noopener noreferrer" className={item}>
              <ExternalLink className="h-4 w-4 text-muted" /> Open in Stripe
            </a>
          )}
          {isOpen && (
            <>
              <div className="my-1 border-t border-border" />
              <button role="menuitem" className={item} onClick={() => run(() => sendReminderNowAction(id))}>
                <BellRing className="h-4 w-4 text-muted" /> Send reminder now
              </button>
              <button role="menuitem" className={item} onClick={() => run(() => resendInvoiceAction(id))}>
                <Mail className="h-4 w-4 text-muted" /> Email invoice again
              </button>
              <button role="menuitem" className={item} onClick={() => run(() => toggleRemindersAction(id, !remindersEnabled))}>
                {remindersEnabled ? <BellOff className="h-4 w-4 text-muted" /> : <BellRing className="h-4 w-4 text-muted" />}
                {remindersEnabled ? "Turn off auto reminders" : "Turn on auto reminders"}
              </button>
            </>
          )}
          {stripeReady && (
            <>
              <div className="my-1 border-t border-border" />
              <button role="menuitem" className={item} onClick={() => run(() => syncInvoiceAction(id))}>
                <RefreshCw className="h-4 w-4 text-muted" /> Sync from Stripe
              </button>
              {isOpen && (
                <button
                  role="menuitem"
                  className={cn(item, "text-danger")}
                  onClick={() => {
                    if (confirm("Void this invoice? The client will no longer be able to pay it. This can't be undone.")) run(() => voidInvoiceAction(id));
                    else setOpen(false);
                  }}
                >
                  <Ban className="h-4 w-4" /> Void invoice
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
