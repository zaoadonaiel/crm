"use client";

import { useMemo, useState, type DragEvent } from "react";
import { ArrowDown, ArrowUp, GripVertical, Monitor, MousePointerClick, Smartphone } from "lucide-react";
import type { EmailBlock } from "@/db/schema";
import { BLOCK_LABELS, cloneBlock, newBlock, renderCampaign, resolveTheme, type BlockType } from "@/lib/email/render-campaign";
import { cn } from "@/lib/utils";
import { BlockInspector } from "./block-inspector";
import { BLOCK_ICONS, PALETTE_ORDER } from "./block-icons";
import { EmailPreview } from "./email-preview";
import { Segmented } from "./fields";
import type { BuilderCampaign, BuilderSettings } from "./types";

const DND_BLOCK = "application/x-dc-block-index";
const DND_NEW = "application/x-dc-block-type";

function blockSummary(b: EmailBlock): string {
  const strip = (s: string) => s.replace(/[*[\]()#]/g, "").replace(/\s+/g, " ").trim();
  switch (b.type) {
    case "heading":
      return strip(b.text);
    case "text":
      return strip(b.text);
    case "button":
      return b.label;
    case "image":
      return b.alt || (b.src ? "Image" : "No image yet");
    case "logo":
      return b.src ? "Custom logo" : "From settings";
    case "columns":
      return strip(b.left);
    case "social":
      return `${b.links.length} link${b.links.length === 1 ? "" : "s"}`;
    case "spacer":
      return `${b.height}px`;
    case "html":
      return strip(b.html.replace(/<[^>]+>/g, " ")) || "HTML";
    default:
      return "";
  }
}

export function ContentEditor({
  campaign,
  settings,
  onBlocksChange,
}: {
  campaign: BuilderCampaign;
  settings: BuilderSettings;
  onBlocksChange: (blocks: EmailBlock[]) => void;
}) {
  const blocks = campaign.blocks;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const theme = useMemo(() => resolveTheme(campaign.theme, settings), [campaign.theme, settings]);
  const html = useMemo(
    () =>
      renderCampaign({
        blocks,
        theme: campaign.theme,
        subject: campaign.subject,
        previewText: campaign.previewText,
        vars: { first_name: "Alex", name: "Alex Sample", company: "Sample Co", email: "alex@example.com" },
        unsubscribeUrl: "#",
        settings,
        preview: true,
      }).html,
    [blocks, campaign.theme, campaign.subject, campaign.previewText, settings],
  );

  const selectedIndex = blocks.findIndex((b) => b.id === selectedId);
  const selected = selectedIndex >= 0 ? blocks[selectedIndex] : undefined;

  function insert(type: BlockType, at?: number) {
    const block = newBlock(type);
    const index = at ?? (selectedIndex >= 0 ? selectedIndex + 1 : blocks.length);
    const next = [...blocks];
    next.splice(index, 0, block);
    onBlocksChange(next);
    setSelectedId(block.id);
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= blocks.length || from === to) return;
    const next = [...blocks];
    const [b] = next.splice(from, 1);
    next.splice(to, 0, b!);
    onBlocksChange(next);
  }

  function update(block: EmailBlock) {
    onBlocksChange(blocks.map((b) => (b.id === block.id ? block : b)));
  }

  function duplicate(index: number) {
    const copy = cloneBlock(blocks[index]!);
    const next = [...blocks];
    next.splice(index + 1, 0, copy);
    onBlocksChange(next);
    setSelectedId(copy.id);
  }

  function remove(index: number) {
    const next = blocks.filter((_, i) => i !== index);
    onBlocksChange(next);
    setSelectedId(next[Math.min(index, next.length - 1)]?.id ?? null);
  }

  /* Drag and drop (layers list) ------------------------------------ */
  function onDragOverItem(e: DragEvent, index: number) {
    if (!e.dataTransfer.types.includes(DND_BLOCK) && !e.dataTransfer.types.includes(DND_NEW)) return;
    e.preventDefault();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const after = e.clientY > rect.top + rect.height / 2;
    setDropIndex(index + (after ? 1 : 0));
    e.dataTransfer.dropEffect = e.dataTransfer.types.includes(DND_NEW) ? "copy" : "move";
  }
  function onDrop(e: DragEvent) {
    e.preventDefault();
    const target = dropIndex ?? blocks.length;
    const type = e.dataTransfer.getData(DND_NEW) as BlockType;
    const fromRaw = e.dataTransfer.getData(DND_BLOCK);
    if (type && type in BLOCK_LABELS) insert(type, target);
    else if (fromRaw !== "") {
      const from = Number(fromRaw);
      move(from, target > from ? target - 1 : target);
    }
    setDragIndex(null);
    setDropIndex(null);
  }
  const endDrag = () => {
    setDragIndex(null);
    setDropIndex(null);
  };

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[248px_minmax(0,1fr)_340px]">
      {/* Left: palette + layers */}
      <aside className="scroll-thin border-b border-border bg-surface lg:overflow-y-auto lg:border-r lg:border-b-0">
        <div className="p-4">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Add block</h2>
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5 lg:grid-cols-2">
            {PALETTE_ORDER.map((type) => {
              const Icon = BLOCK_ICONS[type];
              return (
                <button
                  key={type}
                  type="button"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(DND_NEW, type);
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  onDragEnd={endDrag}
                  onClick={() => insert(type)}
                  title={`Add ${BLOCK_LABELS[type].toLowerCase()}${selected ? " below the selected block" : ""}`}
                  className="group flex flex-col items-center gap-1.5 rounded-lg border border-border bg-surface px-2 py-3 text-[12px] font-medium text-foreground/80 transition hover:border-brand/40 hover:bg-brand-50 hover:text-foreground active:scale-[.98]"
                >
                  <Icon className="h-[18px] w-[18px] text-muted transition group-hover:text-brand" />
                  <span className="text-center leading-tight">{BLOCK_LABELS[type]}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="border-t border-border p-4">
          <h2 className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted">
            Layers <span className="font-normal normal-case tracking-normal">{blocks.length} blocks</span>
          </h2>
          <ol
            className="space-y-1"
            onDragOver={(e) => {
              if (!blocks.length && e.dataTransfer.types.includes(DND_NEW)) {
                e.preventDefault();
                setDropIndex(0);
              }
            }}
            onDrop={onDrop}
            aria-label="Email blocks"
          >
            {blocks.map((b, i) => {
              const Icon = BLOCK_ICONS[b.type];
              const active = b.id === selectedId;
              return (
                <li
                  key={b.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(DND_BLOCK, String(i));
                    e.dataTransfer.effectAllowed = "move";
                    setDragIndex(i);
                  }}
                  onDragOver={(e) => onDragOverItem(e, i)}
                  onDragEnd={endDrag}
                  className={cn(
                    "group relative flex items-center gap-1 rounded-lg border px-1.5 py-1.5 transition",
                    active ? "border-brand/40 bg-brand-50" : "border-transparent hover:bg-black/[.03]",
                    dragIndex === i && "opacity-40",
                  )}
                >
                  {dropIndex === i && <span className="absolute -top-[3px] right-1 left-1 h-0.5 rounded bg-brand" aria-hidden />}
                  {dropIndex === i + 1 && i === blocks.length - 1 && (
                    <span className="absolute right-1 -bottom-[3px] left-1 h-0.5 rounded bg-brand" aria-hidden />
                  )}
                  <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted/60" aria-hidden />
                  <button
                    type="button"
                    onClick={() => setSelectedId(b.id)}
                    aria-current={active ? "true" : undefined}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <Icon className={cn("h-4 w-4 shrink-0", active ? "text-brand" : "text-muted")} />
                    <span className="min-w-0">
                      <span className="block text-[13px] leading-tight font-medium">{BLOCK_LABELS[b.type]}</span>
                      <span className="block truncate text-[11px] text-muted">{blockSummary(b) || " "}</span>
                    </span>
                  </button>
                  <span className="flex shrink-0 opacity-0 transition group-focus-within:opacity-100 group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => move(i, i - 1)}
                      disabled={i === 0}
                      aria-label={`Move ${BLOCK_LABELS[b.type]} up`}
                      className="grid h-6 w-6 place-items-center rounded text-muted hover:bg-black/5 hover:text-foreground disabled:opacity-30"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(i, i + 1)}
                      disabled={i === blocks.length - 1}
                      aria-label={`Move ${BLOCK_LABELS[b.type]} down`}
                      className="grid h-6 w-6 place-items-center rounded text-muted hover:bg-black/5 hover:text-foreground disabled:opacity-30"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                  </span>
                </li>
              );
            })}
            {!blocks.length && (
              <li
                className={cn(
                  "rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted",
                  dropIndex === 0 && "border-brand bg-brand-50",
                )}
              >
                Click or drag a block here
              </li>
            )}
          </ol>
          {blocks.length > 1 && <p className="mt-2 text-[11px] text-muted">Drag to reorder.</p>}
        </div>
      </aside>

      {/* Center: live preview */}
      <section className="scroll-thin min-w-0 bg-[#eef0f3] dark:bg-[#0a0b0e] lg:overflow-y-auto" aria-label="Email preview">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-black/5 bg-[#eef0f3]/90 dark:bg-[#0a0b0e]/90 px-4 py-2 backdrop-blur">
          <p className="hidden items-center gap-1.5 text-xs text-muted sm:flex">
            <MousePointerClick className="h-3.5 w-3.5" /> Click any block to edit it
          </p>
          <Segmented
            label="Preview device"
            value={device}
            onChange={setDevice}
            options={[
              { value: "desktop", label: <Monitor className="h-4 w-4" />, title: "Desktop preview" },
              { value: "mobile", label: <Smartphone className="h-4 w-4" />, title: "Mobile preview" },
            ]}
          />
        </div>
        <div className={cn("px-2 py-4 sm:px-6", device === "mobile" && "py-8")}>
          <EmailPreview html={html} device={device} selectedId={selectedId} onSelect={setSelectedId} brandColor={theme.brandColor} />
        </div>
      </section>

      {/* Right: inspector */}
      <aside className="scroll-thin border-t border-border bg-surface lg:overflow-y-auto lg:border-t-0 lg:border-l">
        {selected ? (
          <BlockInspector
            key={selected.id}
            block={selected}
            theme={theme}
            index={selectedIndex}
            total={blocks.length}
            onChange={update}
            onMove={(dir) => move(selectedIndex, selectedIndex + dir)}
            onDuplicate={() => duplicate(selectedIndex)}
            onDelete={() => remove(selectedIndex)}
            onClose={() => setSelectedId(null)}
          />
        ) : (
          <div className="flex h-full min-h-48 flex-col items-center justify-center gap-2 p-8 text-center">
            <div className="grid h-11 w-11 place-items-center rounded-full bg-brand-50 text-brand">
              <MousePointerClick className="h-5 w-5" />
            </div>
            <p className="text-sm font-semibold">Select a block</p>
            <p className="max-w-56 text-[13px] text-muted">
              Click a block in the preview or in Layers to edit its text, colors, links and images.
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}
