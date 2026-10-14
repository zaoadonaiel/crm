"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { AlignCenter, AlignLeft, AlignRight, Bold, Braces, ImageUp, Italic, Link2, List, Loader2, RotateCcw } from "lucide-react";
import { Input, Textarea } from "@/components/ui";
import { cn } from "@/lib/utils";

type Align = "left" | "center" | "right";

export function FieldRow({ label, htmlFor, hint, children, action }: { label: string; htmlFor?: string; hint?: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label htmlFor={htmlFor} className="text-[13px] font-medium text-foreground">
          {label}
        </label>
        {action}
      </div>
      {children}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Segmented<T extends string | number>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; title?: string }[];
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border border-border bg-surface-2 p-0.5">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={active}
            title={o.title}
            aria-label={o.title}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex h-7 min-w-8 items-center justify-center rounded-md px-2 text-[13px] font-medium transition",
              active ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function AlignField({ value, onChange }: { value: Align; onChange: (v: Align) => void }) {
  return (
    <FieldRow label="Alignment">
      <Segmented
        label="Alignment"
        value={value}
        onChange={onChange}
        options={[
          { value: "left", label: <AlignLeft className="h-4 w-4" />, title: "Align left" },
          { value: "center", label: <AlignCenter className="h-4 w-4" />, title: "Align center" },
          { value: "right", label: <AlignRight className="h-4 w-4" />, title: "Align right" },
        ]}
      />
    </FieldRow>
  );
}

export function ColorField({
  label,
  value,
  onChange,
  placeholder,
  allowReset = true,
}: {
  label: string;
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  placeholder: string;
  allowReset?: boolean;
}) {
  const id = useId();
  const shown = value || placeholder;
  const valid = /^#[0-9a-f]{6}$/i.test(shown);
  return (
    <FieldRow
      label={label}
      htmlFor={id}
      action={
        allowReset && value ? (
          <button type="button" onClick={() => onChange(undefined)} className="flex items-center gap-1 text-xs text-muted hover:text-foreground">
            <RotateCcw className="h-3 w-3" /> Default
          </button>
        ) : null
      }
    >
      <div className="flex items-center gap-2">
        <label className="relative h-10 w-10 shrink-0 cursor-pointer overflow-hidden rounded-lg border border-border" style={{ background: shown }}>
          <span className="sr-only">Pick {label.toLowerCase()}</span>
          <input
            type="color"
            value={valid ? shown : "#000000"}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </label>
        <Input id={id} value={value ?? ""} placeholder={placeholder} onChange={(e) => onChange(e.target.value || undefined)} className="font-mono text-[13px]" />
      </div>
    </FieldRow>
  );
}

export function RangeField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  unit = "px",
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  unit?: string;
}) {
  const id = useId();
  return (
    <FieldRow label={label} htmlFor={id} action={<span className="text-xs tabular-nums text-muted">{value}{unit}</span>}>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[var(--brand)]"
      />
    </FieldRow>
  );
}

export function ToggleField({ label, description, checked, onChange }: { label: string; description?: ReactNode; checked: boolean; onChange: (v: boolean) => void }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <label htmlFor={id} className="text-[13px] font-medium">
          {label}
        </label>
        {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn("relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors", checked ? "bg-brand" : "bg-black/15")}
      >
        <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", checked ? "left-[22px]" : "left-0.5")} />
      </button>
    </div>
  );
}

export const MERGE_TAGS = [
  { tag: "{{first_name|there}}", label: "First name" },
  { tag: "{{name}}", label: "Full name" },
  { tag: "{{company|your business}}", label: "Company" },
  { tag: "{{email}}", label: "Email" },
];

export function MergeTagMenu({ onInsert }: { onInsert: (tag: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted hover:bg-black/5 hover:text-foreground"
      >
        <Braces className="h-3.5 w-3.5" /> Personalize
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden />
          <div role="menu" className="absolute right-0 z-20 mt-1 w-56 rounded-lg border border-border bg-surface p-1 shadow-lg">
            {MERGE_TAGS.map((m) => (
              <button
                key={m.tag}
                type="button"
                role="menuitem"
                onClick={() => {
                  onInsert(m.tag);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-brand-50"
              >
                <span>{m.label}</span>
                <code className="truncate text-[11px] text-muted">{m.tag}</code>
              </button>
            ))}
            <p className="border-t border-border px-2 pt-1.5 pb-1 text-[11px] text-muted">
              Text after <code>|</code> is the fallback when the value is missing.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

/** Insert text at the cursor of an input/textarea and report the new value. */
function insertAtCursor(el: HTMLInputElement | HTMLTextAreaElement | null, current: string, before: string, after = "", placeholder = "") {
  const start = el?.selectionStart ?? current.length;
  const end = el?.selectionEnd ?? current.length;
  const selected = current.slice(start, end) || placeholder;
  const next = current.slice(0, start) + before + selected + after + current.slice(end);
  const selStart = start + before.length;
  const selEnd = selStart + selected.length;
  requestAnimationFrame(() => {
    if (!el) return;
    el.focus();
    el.setSelectionRange(selStart, selEnd);
  });
  return next;
}

function ToolButton({ title, onClick, children }: { title: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-black/5 hover:text-foreground"
    >
      {children}
    </button>
  );
}

/** Textarea with a light-markdown toolbar and merge-tag insertion. */
export function RichTextField({
  label,
  value,
  onChange,
  rows = 8,
  markdown = true,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  markdown?: boolean;
}) {
  const id = useId();
  const ref = useRef<HTMLTextAreaElement>(null);
  const bullet = () => {
    const el = ref.current;
    const start = el?.selectionStart ?? value.length;
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    const next = value.slice(0, lineStart) + "- " + value.slice(lineStart);
    onChange(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + 2, start + 2);
    });
  };
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium">
        {label}
      </label>
      <div className="rounded-lg border border-border bg-surface focus-within:border-brand focus-within:ring-3 focus-within:ring-brand/15">
        <div className="flex items-center gap-0.5 border-b border-border px-1 py-1">
          {markdown && (
            <>
              <ToolButton title="Bold" onClick={() => onChange(insertAtCursor(ref.current, value, "**", "**", "bold text"))}>
                <Bold className="h-3.5 w-3.5" />
              </ToolButton>
              <ToolButton title="Italic" onClick={() => onChange(insertAtCursor(ref.current, value, "*", "*", "italic text"))}>
                <Italic className="h-3.5 w-3.5" />
              </ToolButton>
              <ToolButton title="Link" onClick={() => onChange(insertAtCursor(ref.current, value, "[", "](https://)", "link text"))}>
                <Link2 className="h-3.5 w-3.5" />
              </ToolButton>
              <ToolButton title="Bullet list" onClick={bullet}>
                <List className="h-3.5 w-3.5" />
              </ToolButton>
            </>
          )}
          <div className="ml-auto">
            <MergeTagMenu onInsert={(tag) => onChange(insertAtCursor(ref.current, value, tag))} />
          </div>
        </div>
        <Textarea
          id={id}
          ref={ref}
          rows={rows}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="rounded-t-none border-0 focus:ring-0"
        />
      </div>
      {markdown && (
        <p className="mt-1 text-[11px] text-muted">
          **bold** · *italic* · [text](url) · start a line with “- ” for bullets
        </p>
      )}
    </div>
  );
}

/** Text input with merge-tag insertion. */
export function TagInput({ label, value, onChange, placeholder, hint }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; hint?: ReactNode }) {
  const id = useId();
  const ref = useRef<HTMLInputElement>(null);
  return (
    <FieldRow label={label} htmlFor={id} hint={hint} action={<MergeTagMenu onInsert={(t) => onChange(insertAtCursor(ref.current, value, t))} />}>
      <Input id={id} ref={ref} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </FieldRow>
  );
}

/** Image URL field with R2 upload (falls back to paste-a-URL when uploads are unavailable). */
export function ImageField({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint?: ReactNode }) {
  const id = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  async function upload(file: File) {
    setError(null);
    if (!file.type.startsWith("image/")) return setError("Please choose an image file.");
    if (file.size > 5 * 1024 * 1024) return setError("Images must be 5 MB or smaller.");
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/media", { method: "POST", body });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error || `Upload failed (${res.status})`);
      onChange(data.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <FieldRow label={label} htmlFor={id} hint={hint}>
      <div
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("Files")) {
            e.preventDefault();
            setDragOver(true);
          }
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          const file = e.dataTransfer.files?.[0];
          setDragOver(false);
          if (file) {
            e.preventDefault();
            void upload(file);
          }
        }}
        className={cn("rounded-lg border border-dashed border-border p-2 transition", dragOver && "border-brand bg-brand-50")}
      >
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="" className="mb-2 max-h-32 w-full rounded-md bg-surface-2 object-contain" />
        ) : null}
        <div className="flex gap-2">
          <Input id={id} value={value} placeholder="https://… or upload" onChange={(e) => onChange(e.target.value)} className="h-9 text-[13px]" />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-[13px] font-medium hover:bg-surface-2 disabled:opacity-60"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageUp className="h-4 w-4" />}
            {uploading ? "Uploading" : "Upload"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
              e.target.value = "";
            }}
          />
        </div>
        {!value && <p className="mt-1.5 px-0.5 text-[11px] text-muted">Drop an image here · PNG, JPG, GIF or WebP up to 5 MB</p>}
      </div>
      {error && (
        <p role="alert" className="mt-1 text-xs text-danger">
          {error}
        </p>
      )}
    </FieldRow>
  );
}
