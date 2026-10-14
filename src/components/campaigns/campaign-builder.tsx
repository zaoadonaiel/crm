"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowLeft, Check, CloudOff, Loader2, Pencil } from "lucide-react";
import type { EmailBlock } from "@/db/schema";
import { Badge } from "@/components/ui";
import { checkDeliverability } from "@/lib/campaigns/deliverability";
import { statusTone } from "@/lib/status";
import { cn } from "@/lib/utils";
import { getAudienceCount, saveCampaign, type CampaignPatch } from "@/app/(admin)/campaigns/actions";
import { AudienceEditor, type AudienceCount } from "./audience-editor";
import { ContentEditor } from "./content-editor";
import { ReviewSend } from "./review-send";
import { SettingsEditor } from "./settings-editor";
import type { BuilderCampaign, BuilderSettings, ClientOption, EditableFields, SaveState } from "./types";

type Tab = "content" | "settings" | "audience" | "review";
const TABS: { id: Tab; label: string }[] = [
  { id: "content", label: "Content" },
  { id: "settings", label: "Settings" },
  { id: "audience", label: "Audience" },
  { id: "review", label: "Review & send" },
];

const SAVE_DELAY = 800;

/** Relative "saved" time; re-evaluated by SaveIndicator's 30s tick. */
function timeAgo(d: Date) {
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  return m < 60 ? `${m}m ago` : d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function SaveIndicator({ state, savedAt, onRetry }: { state: SaveState; savedAt: Date | null; onRetry: () => void }) {
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  const ago = savedAt ? timeAgo(savedAt) : "";
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted" role="status" aria-live="polite">
      {state === "saving" && (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
        </>
      )}
      {state === "dirty" && (
        <>
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Unsaved changes
        </>
      )}
      {state === "saved" && (
        <>
          <Check className="h-3.5 w-3.5 text-green-600" /> Saved{ago ? ` · ${ago}` : ""}
        </>
      )}
      {state === "error" && (
        <button type="button" onClick={onRetry} className="flex items-center gap-1.5 text-danger hover:underline">
          <CloudOff className="h-3.5 w-3.5" /> Couldn&apos;t save — retry
        </button>
      )}
    </span>
  );
}

export function CampaignBuilder({
  initial,
  settings,
  clients,
  tags,
  initialCount,
  adminEmail,
}: {
  initial: BuilderCampaign;
  settings: BuilderSettings;
  clients: ClientOption[];
  tags: string[];
  initialCount: number;
  adminEmail: string;
}) {
  const [draft, setDraft] = useState<BuilderCampaign>(initial);
  const draftRef = useRef(draft);
  const [tab, setTab] = useState<Tab>("content");
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [count, setCount] = useState<AudienceCount>({ loading: false, count: initialCount });
  const [editingName, setEditingName] = useState(false);

  /* Autosave --------------------------------------------------------- */
  const pending = useRef<CampaignPatch>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflight = useRef<Promise<boolean> | null>(null);

  const flush = useCallback(async (): Promise<boolean> => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    // Serialize saves so they can't land out of order.
    while (inflight.current) await inflight.current;
    const patch = pending.current;
    if (!Object.keys(patch).length) return true;
    pending.current = {};
    setSaveState("saving");
    const run = (async () => {
      const res = await saveCampaign(draftRef.current.id, patch).catch((e: unknown) => ({
        ok: false as const,
        error: e instanceof Error ? e.message : "Network error",
      }));
      if (res.ok) {
        setSavedAt(new Date(res.savedAt));
        setSaveError(null);
        setSaveState(Object.keys(pending.current).length ? "dirty" : "saved");
        return true;
      }
      // Put the failed fields back (newer edits win).
      pending.current = { ...patch, ...pending.current };
      setSaveError(res.error);
      setSaveState("error");
      return false;
    })();
    inflight.current = run;
    try {
      return await run;
    } finally {
      inflight.current = null;
    }
  }, []);

  const commit = useCallback(
    (patch: Partial<EditableFields>) => {
      const next = { ...draftRef.current, ...patch };
      draftRef.current = next;
      setDraft(next);
      pending.current = { ...pending.current, ...patch } as CampaignPatch;
      setSaveState("dirty");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), SAVE_DELAY);
    },
    [flush],
  );

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (Object.keys(pending.current).length || inflight.current) {
        void flush();
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      if (timer.current) clearTimeout(timer.current);
      if (Object.keys(pending.current).length) void flush();
    };
  }, [flush]);

  // Cmd/Ctrl+S saves immediately.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void flush();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flush]);

  /* Live audience count ---------------------------------------------- */
  const audienceKey = JSON.stringify(draft.audience);
  const firstCount = useRef(true);
  useEffect(() => {
    if (firstCount.current) {
      firstCount.current = false;
      return;
    }
    let cancelled = false;
    setCount((c) => ({ ...c, loading: true, error: undefined }));
    const t = setTimeout(async () => {
      const res = await getAudienceCount(JSON.parse(audienceKey)).catch(() => ({ ok: false as const, error: "Couldn't count recipients" }));
      if (cancelled) return;
      setCount(res.ok ? { loading: false, count: res.count } : { loading: false, count: null, error: res.error });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [audienceKey]);

  const checks = useMemo(
    () =>
      checkDeliverability({
        subject: draft.subject,
        previewText: draft.previewText,
        blocks: draft.blocks,
        address: settings.address,
        fromEmail: settings.fromEmail,
        audienceCount: count.loading ? null : count.count,
      }),
    [draft.subject, draft.previewText, draft.blocks, settings.address, settings.fromEmail, count.loading, count.count],
  );
  const issueCount = (t: Tab) => checks.filter((c) => c.level !== "info" && c.tab === t).length;
  const onBlocksChange = useCallback((blocks: EmailBlock[]) => commit({ blocks }), [commit]);

  return (
    <div className="flex min-h-[100dvh] flex-col lg:h-[100dvh] lg:min-h-0">
      {/* Header */}
      <header className="border-b border-border bg-surface">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 pt-3 sm:px-6">
          <Link href="/campaigns" className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-black/5 hover:text-foreground" aria-label="Back to campaigns">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {editingName ? (
              <input
                autoFocus
                aria-label="Campaign name"
                defaultValue={draft.name}
                maxLength={200}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== draft.name) commit({ name: v });
                  setEditingName(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  if (e.key === "Escape") setEditingName(false);
                }}
                className="h-8 w-full max-w-md rounded-md border border-brand px-2 text-[16px] font-semibold outline-none ring-3 ring-brand/15"
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditingName(true)}
                className="group flex min-w-0 items-center gap-2 rounded-md px-1 py-0.5 text-left hover:bg-black/[.04]"
                title="Rename"
              >
                <h1 className="truncate text-[16px] font-semibold">{draft.name}</h1>
                <Pencil className="h-3.5 w-3.5 shrink-0 text-muted opacity-0 transition group-hover:opacity-100" />
              </button>
            )}
            <Badge tone={statusTone(draft.status)}>{draft.status}</Badge>
          </div>
          <div className="flex items-center gap-3">
            <SaveIndicator state={saveState} savedAt={savedAt} onRetry={() => void flush()} />
            {saveState === "error" && saveError && <span className="sr-only">{saveError}</span>}
            <button
              type="button"
              onClick={() => setTab("review")}
              className="hidden h-8 items-center rounded-lg bg-brand px-3 text-[13px] font-medium text-white shadow-sm hover:bg-brand-600 sm:inline-flex"
            >
              Review & send
            </button>
          </div>
        </div>
        <nav className="scroll-thin mt-2 flex gap-1 overflow-x-auto px-4 sm:px-6" role="tablist" aria-label="Campaign steps">
          {TABS.map((t, i) => {
            const n = t.id === "review" ? checks.filter((c) => c.level === "error").length : issueCount(t.id);
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.id)}
                className={cn(
                  "relative flex shrink-0 items-center gap-2 px-3 pt-1.5 pb-2.5 text-[13px] font-medium transition",
                  active ? "text-foreground" : "text-muted hover:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "grid h-5 w-5 place-items-center rounded-full text-[11px] font-semibold",
                    active ? "bg-brand text-white" : "bg-black/[.06] text-muted",
                  )}
                >
                  {i + 1}
                </span>
                {t.label}
                {n > 0 && (
                  <span className="grid h-4 min-w-4 place-items-center rounded-full bg-amber-100 px-1 text-[10px] font-semibold text-amber-700" aria-label={`${n} issues`}>
                    {n}
                  </span>
                )}
                {active && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-brand" />}
              </button>
            );
          })}
        </nav>
      </header>

      {saveState === "error" && saveError && (
        <div role="alert" className="flex items-center gap-2 border-b border-red-200 bg-red-50 px-6 py-2 text-[13px] text-red-700">
          <AlertCircle className="h-4 w-4" /> {saveError}
        </div>
      )}

      {tab === "content" && <ContentEditor campaign={draft} settings={settings} onBlocksChange={onBlocksChange} />}
      {tab === "settings" && <SettingsEditor campaign={draft} settings={settings} onChange={commit} />}
      {tab === "audience" && (
        <AudienceEditor audience={draft.audience} onChange={(audience) => commit({ audience })} clients={clients} tags={tags} count={count} />
      )}
      {tab === "review" && (
        <ReviewSend
          campaign={draft}
          settings={settings}
          count={count}
          checks={checks}
          flush={flush}
          goTo={setTab}
          defaultTestEmail={adminEmail}
        />
      )}
    </div>
  );
}
