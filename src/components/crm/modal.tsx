"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Accessible modal built on the native <dialog> element (focus trap + Esc for free). */
export function Modal({
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
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
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
      aria-labelledby="modal-title"
      className={cn(
        "m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-border bg-surface p-0 text-foreground shadow-2xl backdrop:bg-[#000]/40 backdrop:backdrop-blur-[1px]",
        className,
      )}
    >
      {open && (
        <div>
          <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
            <div>
              <h2 id="modal-title" className="text-base font-semibold">
                {title}
              </h2>
              {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
            </div>
            <button type="button" onClick={onClose} className="rounded-md p-1 text-muted hover:bg-black/5 hover:text-foreground" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="px-6 py-5">{children}</div>
        </div>
      )}
    </dialog>
  );
}
