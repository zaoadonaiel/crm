"use client";

import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, Copy, Plus, Trash2, X } from "lucide-react";
import type { EmailBlock, EmailTheme } from "@/db/schema";
import { Input, Select, Textarea } from "@/components/ui";
import { BLOCK_LABELS, SOCIAL_NETWORKS } from "@/lib/email/render-campaign";
import { AlignField, ColorField, FieldRow, ImageField, RangeField, RichTextField, Segmented, TagInput, ToggleField } from "./fields";
import { BLOCK_ICONS } from "./block-icons";

type Props = {
  block: EmailBlock;
  theme: EmailTheme;
  index: number;
  total: number;
  onChange: (block: EmailBlock) => void;
  onMove: (dir: -1 | 1) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onClose: () => void;
};

export function BlockInspector({ block, theme, index, total, onChange, onMove, onDuplicate, onDelete, onClose }: Props) {
  const Icon = BLOCK_ICONS[block.type];
  // Typed patch helper for the current block variant.
  const set = <B extends EmailBlock>(b: B, patch: Partial<B>) => onChange({ ...b, ...patch });
  const innerWidth = theme.width - 64;

  const iconBtn = (label: string, onClick: () => void, icon: ReactNode, disabled = false, danger = false) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={
        "grid h-8 w-8 place-items-center rounded-lg text-muted transition hover:bg-black/5 hover:text-foreground disabled:pointer-events-none disabled:opacity-40" +
        (danger ? " hover:!bg-red-50 hover:!text-red-600" : "")
      }
    >
      {icon}
    </button>
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-brand-50 text-brand">
            <Icon className="h-4 w-4" />
          </span>
          <h3 className="truncate text-[14px] font-semibold">{BLOCK_LABELS[block.type]}</h3>
        </div>
        <div className="flex items-center">
          {iconBtn("Move up", () => onMove(-1), <ArrowUp className="h-4 w-4" />, index === 0)}
          {iconBtn("Move down", () => onMove(1), <ArrowDown className="h-4 w-4" />, index === total - 1)}
          {iconBtn("Duplicate", onDuplicate, <Copy className="h-4 w-4" />)}
          {iconBtn("Delete block", onDelete, <Trash2 className="h-4 w-4" />, false, true)}
          {iconBtn("Close", onClose, <X className="h-4 w-4" />)}
        </div>
      </div>

      <div className="scroll-thin flex-1 space-y-5 overflow-y-auto p-4">
        {block.type === "logo" && (
          <>
            <ImageField
              label="Logo image"
              value={block.src}
              onChange={(src) => set(block, { src })}
              hint="Leave empty to use the logo from Settings (or your business name)."
            />
            <RangeField label="Width" value={block.width} min={40} max={Math.min(360, innerWidth)} onChange={(width) => set(block, { width })} />
            <AlignField value={block.align} onChange={(align) => set(block, { align })} />
            <FieldRow label="Link (optional)">
              <Input value={block.href ?? ""} placeholder="https://yourwebsite.com" onChange={(e) => set(block, { href: e.target.value || undefined })} />
            </FieldRow>
          </>
        )}

        {block.type === "heading" && (
          <>
            <TagInput label="Heading text" value={block.text} onChange={(text) => set(block, { text })} />
            <FieldRow label="Size">
              <Segmented
                label="Heading size"
                value={block.level}
                onChange={(level) => set(block, { level })}
                options={[
                  { value: 1, label: "Large", title: "Large (H1)" },
                  { value: 2, label: "Medium", title: "Medium (H2)" },
                  { value: 3, label: "Small", title: "Small (H3)" },
                ]}
              />
            </FieldRow>
            <AlignField value={block.align} onChange={(align) => set(block, { align })} />
            <ColorField label="Color" value={block.color} placeholder={theme.textColor} onChange={(color) => set(block, { color })} />
          </>
        )}

        {block.type === "text" && (
          <>
            <RichTextField label="Text" value={block.text} onChange={(text) => set(block, { text })} rows={10} />
            <AlignField value={block.align} onChange={(align) => set(block, { align })} />
            <RangeField label="Font size" value={block.size ?? 16} min={12} max={22} onChange={(size) => set(block, { size })} />
            <ColorField label="Color" value={block.color} placeholder={theme.textColor} onChange={(color) => set(block, { color })} />
          </>
        )}

        {block.type === "image" && (
          <>
            <ImageField label="Image" value={block.src} onChange={(src) => set(block, { src })} />
            <FieldRow label="Alt text" hint="Describes the image when it's blocked — important for accessibility and spam filters.">
              <Input value={block.alt} placeholder="e.g. Screenshot of the new dashboard" onChange={(e) => set(block, { alt: e.target.value })} />
            </FieldRow>
            <RangeField label="Width" value={Math.min(block.width, innerWidth)} min={80} max={innerWidth} step={4} onChange={(width) => set(block, { width })} />
            <AlignField value={block.align} onChange={(align) => set(block, { align })} />
            <FieldRow label="Link (optional)">
              <Input value={block.href ?? ""} placeholder="https://" onChange={(e) => set(block, { href: e.target.value || undefined })} />
            </FieldRow>
            <ToggleField label="Rounded corners" checked={!!block.rounded} onChange={(rounded) => set(block, { rounded })} />
          </>
        )}

        {block.type === "button" && (
          <>
            <TagInput label="Button label" value={block.label} onChange={(label) => set(block, { label })} />
            <FieldRow label="Link" hint="Where the button goes. Use a full URL starting with https://">
              <Input value={block.href} placeholder="https://" onChange={(e) => set(block, { href: e.target.value })} />
            </FieldRow>
            <AlignField value={block.align} onChange={(align) => set(block, { align })} />
            <ColorField label="Button color" value={block.color} placeholder={theme.brandColor} onChange={(color) => set(block, { color })} />
            <ColorField label="Text color" value={block.textColor} placeholder="auto" onChange={(textColor) => set(block, { textColor })} />
          </>
        )}

        {block.type === "divider" && (
          <ColorField label="Line color" value={block.color} placeholder="#e6e6ea" onChange={(color) => set(block, { color })} />
        )}

        {block.type === "spacer" && (
          <RangeField label="Height" value={block.height} min={4} max={120} step={2} onChange={(height) => set(block, { height })} />
        )}

        {block.type === "columns" && (
          <>
            <div className="rounded-lg bg-surface-2 p-3 text-xs text-muted">Columns stack vertically on phones.</div>
            <ImageField label="Left image (optional)" value={block.leftImage ?? ""} onChange={(leftImage) => set(block, { leftImage: leftImage || undefined })} />
            <RichTextField label="Left text" value={block.left} onChange={(left) => set(block, { left })} rows={5} />
            <ImageField label="Right image (optional)" value={block.rightImage ?? ""} onChange={(rightImage) => set(block, { rightImage: rightImage || undefined })} />
            <RichTextField label="Right text" value={block.right} onChange={(right) => set(block, { right })} rows={5} />
          </>
        )}

        {block.type === "social" && (
          <>
            <div className="space-y-2">
              <p className="text-[13px] font-medium">Links</p>
              {block.links.map((l, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Select
                    aria-label={`Network ${i + 1}`}
                    value={l.network}
                    onChange={(e) => set(block, { links: block.links.map((x, j) => (j === i ? { ...x, network: e.target.value } : x)) })}
                    className="h-9 w-32 shrink-0 text-[13px]"
                  >
                    {SOCIAL_NETWORKS.map((n) => (
                      <option key={n.value} value={n.value}>
                        {n.label}
                      </option>
                    ))}
                  </Select>
                  <Input
                    aria-label={`URL ${i + 1}`}
                    value={l.url}
                    placeholder="https://"
                    onChange={(e) => set(block, { links: block.links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) })}
                    className="h-9 text-[13px]"
                  />
                  {iconBtn("Remove link", () => set(block, { links: block.links.filter((_, j) => j !== i) }), <X className="h-4 w-4" />)}
                </div>
              ))}
              {block.links.length < 8 && (
                <button
                  type="button"
                  onClick={() => set(block, { links: [...block.links, { network: "website", url: "https://" }] })}
                  className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[13px] font-medium text-brand hover:bg-brand-50"
                >
                  <Plus className="h-4 w-4" /> Add link
                </button>
              )}
            </div>
            <AlignField value={block.align} onChange={(align) => set(block, { align })} />
          </>
        )}

        {block.type === "html" && (
          <FieldRow
            label="HTML"
            hint="Advanced: inline-styled, table-based HTML works best. Merge tags like {{first_name}} are supported."
          >
            <Textarea value={block.html} onChange={(e) => set(block, { html: e.target.value })} rows={14} spellCheck={false} className="font-mono text-[12px]" />
          </FieldRow>
        )}
      </div>
    </div>
  );
}
