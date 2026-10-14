"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Accessible modal on the native <dialog> element (focus trap, Esc, backdrop click). */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const ref = React.useRef<HTMLDialogElement>(null);
  const titleId = React.useId();

  React.useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-labelledby={titleId}
      className={cn(
        "m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-border bg-surface p-0 text-foreground shadow-2xl backdrop:bg-[#000]/40",
        className,
      )}
    >
      {open && (
        <div>
          <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
            <div>
              <h2 id={titleId} className="text-base font-semibold">
                {title}
              </h2>
              {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-muted hover:bg-black/5 hover:text-foreground"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="px-6 py-5">{children}</div>
        </div>
      )}
    </dialog>
  );
}

/** Small anchored popover/menu that closes on outside click and Escape. */
export function Popover({
  trigger,
  children,
  align = "right",
  side = "bottom",
  className,
  open: controlledOpen,
  onOpenChange,
}: {
  trigger: (props: { open: boolean; toggle: () => void; "aria-expanded": boolean; "aria-haspopup": true }) => React.ReactNode;
  children: React.ReactNode | ((close: () => void) => React.ReactNode);
  align?: "left" | "right";
  side?: "top" | "bottom";
  className?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [uncontrolled, setUncontrolled] = React.useState(false);
  const open = controlledOpen ?? uncontrolled;
  const setOpen = React.useCallback(
    (v: boolean) => {
      if (onOpenChange) onOpenChange(v);
      else setUncontrolled(v);
    },
    [onOpenChange],
  );
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, setOpen]);

  const close = () => setOpen(false);
  return (
    <div ref={ref} className="relative">
      {trigger({ open, toggle: () => setOpen(!open), "aria-expanded": open, "aria-haspopup": true })}
      {open && (
        <div
          className={cn(
            "absolute z-30 min-w-48 rounded-xl border border-border bg-surface p-1 shadow-lg",
            align === "right" ? "right-0" : "left-0",
            side === "bottom" ? "top-full mt-1" : "bottom-full mb-1",
            className,
          )}
        >
          {typeof children === "function" ? children(close) : children}
        </div>
      )}
    </div>
  );
}

export function MenuItem({
  icon,
  children,
  onClick,
  className,
  disabled,
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-foreground hover:bg-black/[.04] disabled:opacity-50",
        className,
      )}
    >
      {icon && <span className="text-muted [&>svg]:h-4 [&>svg]:w-4">{icon}</span>}
      {children}
    </button>
  );
}
