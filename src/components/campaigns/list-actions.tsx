"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { ArrowRight, Copy, Loader2, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui";
import { CAMPAIGN_TEMPLATES } from "@/lib/campaigns/templates";
import { renderCampaign, type CampaignRenderSettings } from "@/lib/email/render-campaign";
import { cn } from "@/lib/utils";
import { createCampaign, deleteCampaign, duplicateCampaign } from "@/app/(admin)/campaigns/actions";
import { Modal } from "./modal";

function TemplateThumb({ html }: { html: string }) {
  return (
    <div className="pointer-events-none relative h-44 overflow-hidden rounded-t-xl border-b border-border bg-[#eef0f3] dark:bg-[#0a0b0e]">
      <iframe
        title=""
        aria-hidden
        tabIndex={-1}
        srcDoc={html}
        sandbox=""
        className="absolute top-0 left-0 h-[880px] w-[680px] origin-top-left scale-[0.4] border-0"
      />
    </div>
  );
}

function PickButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="group flex w-full items-center justify-between gap-2 p-4 text-left disabled:opacity-60"
      aria-label={`Use the ${label} template`}
    >
      <span className="text-[14px] font-semibold">{label}</span>
      {pending ? <Loader2 className="h-4 w-4 animate-spin text-brand" /> : <ArrowRight className="h-4 w-4 text-muted transition group-hover:translate-x-0.5 group-hover:text-brand" />}
    </button>
  );
}

/** "New campaign" → template picker → server action creates a draft and redirects to the editor. */
export function NewCampaignButton({ settings, label = "New campaign" }: { settings: CampaignRenderSettings; label?: string }) {
  const [open, setOpen] = useState(false);
  // Render thumbnails lazily, only once the picker is opened.
  const thumbs = useMemo(() => {
    const out: Record<string, string> = {};
    if (!open) return out;
    for (const t of CAMPAIGN_TEMPLATES) {
      out[t.id] = renderCampaign({
        blocks: t.blocks(),
        theme: t.theme,
        subject: t.subject,
        previewText: t.previewText,
        vars: { first_name: "Alex", name: "Alex Sample", company: "Sample Co" },
        settings,
        preview: true,
      }).html;
    }
    return out;
  }, [open, settings]);

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> {label}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Start a new campaign" description="Pick a starting point — you can change everything later." size="xl">
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CAMPAIGN_TEMPLATES.map((t) => (
            <li key={t.id} className="overflow-hidden rounded-xl border border-border bg-surface transition hover:border-brand/50 hover:shadow-md">
              <form action={createCampaign.bind(null, t.id)}>
                {thumbs[t.id] ? <TemplateThumb html={thumbs[t.id]!} /> : <div className="h-44 animate-pulse bg-surface-2" />}
                <PickButton label={t.name} />
                <p className="-mt-3 px-4 pb-4 text-[12px] leading-snug text-muted">{t.description}</p>
              </form>
            </li>
          ))}
        </ul>
      </Modal>
    </>
  );
}

/** Row menu: duplicate / delete. */
export function CampaignRowActions({ id, name, deletable }: { id: string; name: string; deletable: boolean }) {
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setMenu((m) => !m)}
        aria-label={`Actions for ${name}`}
        aria-haspopup="menu"
        aria-expanded={menu}
        className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-black/5 hover:text-foreground"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {menu && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} aria-hidden />
          <div role="menu" className="absolute right-0 z-20 mt-1 w-44 rounded-lg border border-border bg-surface p-1 shadow-lg">
            <form action={duplicateCampaign.bind(null, id)}>
              <button type="submit" role="menuitem" className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] hover:bg-surface-2">
                <Copy className="h-4 w-4 text-muted" /> Duplicate
              </button>
            </form>
            <button
              type="button"
              role="menuitem"
              disabled={!deletable}
              title={deletable ? undefined : "Sent campaigns are kept for reporting"}
              onClick={() => {
                setMenu(false);
                setConfirm(true);
              }}
              className={cn("flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] text-red-600 hover:bg-red-50", !deletable && "cursor-not-allowed opacity-40")}
            >
              <Trash2 className="h-4 w-4" /> Delete
            </button>
          </div>
        </>
      )}
      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Delete campaign?"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await deleteCampaign(id);
                  if (!res.ok) return setError(res.error);
                  setConfirm(false);
                  router.refresh();
                })
              }
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin" />} Delete
            </Button>
          </>
        }
      >
        <p className="text-[14px]">
          <strong>{name}</strong> will be permanently deleted.
        </p>
        {error && <p className="mt-2 text-[13px] text-danger">{error}</p>}
      </Modal>
    </div>
  );
}

/** Polls the server while a campaign is sending/queued. */
export function AutoRefresh({ every = 4000 }: { every?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), every);
    return () => clearInterval(t);
  }, [router, every]);
  return null;
}
