"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, Upload } from "lucide-react";
import type { AppSettings } from "@/lib/settings";
import { Button, Card, CardHeader, Field, Input, Textarea } from "@/components/ui";
import { updateSettings } from "@/app/(admin)/settings/actions";

export function SettingsForm({ initial }: { initial: AppSettings }) {
  const [s, setS] = useState(initial);
  const [days, setDays] = useState(initial.invoiceReminderDays.join(", "));
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const set = <K extends keyof AppSettings>(k: K, v: AppSettings[K]) => {
    setS((p) => ({ ...p, [k]: v }));
    setSaved(false);
  };

  async function uploadLogo(file: File) {
    setUploading(true);
    setUploadError(null);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/media", { method: "POST", body: fd });
    const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    setUploading(false);
    if (data.url) set("logoUrl", data.url);
    else setUploadError(data.error ?? "Upload failed. Paste an image URL instead.");
  }

  function save() {
    start(async () => {
      await updateSettings({
        ...s,
        invoiceReminderDays: days
          .split(/[,\s]+/)
          .filter(Boolean)
          .map(Number),
      });
      setSaved(true);
    });
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Brand" description="Shown on the login page, client portal, and emails" />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="Business name">
            <Input value={s.businessName} onChange={(e) => set("businessName", e.target.value)} />
          </Field>
          <Field label="Brand color">
            <div className="flex gap-2">
              <input type="color" value={s.brandColor} onChange={(e) => set("brandColor", e.target.value)} className="h-10 w-12 cursor-pointer rounded-lg border border-border" />
              <Input value={s.brandColor} onChange={(e) => set("brandColor", e.target.value)} />
            </div>
          </Field>
          <Field label="Logo" className="sm:col-span-2" hint="PNG or SVG, ideally about 300×80. Upload or paste a URL.">
            <div className="flex flex-wrap items-center gap-3">
              {s.logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.logoUrl} alt="Logo" className="h-10 rounded border border-border bg-white p-1" />
              )}
              <Input className="min-w-60 flex-1" placeholder="https://…" value={s.logoUrl} onChange={(e) => set("logoUrl", e.target.value)} />
              <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-border px-3 text-sm hover:bg-surface-2">
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Upload
                <input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])} />
              </label>
            </div>
            {uploadError && <p className="mt-1 text-xs text-danger">{uploadError}</p>}
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Sending identity" description="Who your emails come from" />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="From name" hint='A real person’s name gets better open rates, e.g. "Davey from Acme"'>
            <Input value={s.fromName} onChange={(e) => set("fromName", e.target.value)} />
          </Field>
          <Field label="From email" hint="Must be on a domain verified with Resend or Mailgun">
            <Input type="email" value={s.fromEmail} onChange={(e) => set("fromEmail", e.target.value)} />
          </Field>
          <Field label="Mailing address" className="sm:col-span-2" hint="Required by law (CAN-SPAM) in newsletter footers. A PO box is fine.">
            <Input value={s.address} onChange={(e) => set("address", e.target.value)} placeholder="123 Main St, Suite 4, Austin, TX 78701" />
          </Field>
          <Field label="Signature" className="sm:col-span-2" hint="Added to 1:1 replies and follow-ups">
            <Textarea rows={3} value={s.signature} onChange={(e) => set("signature", e.target.value)} placeholder={"Davey\nFounder, Acme Studio\n(555) 123-4567"} />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Invoice reminders" description="Automatic, friendly nudges for unpaid Stripe invoices" />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <label className="flex items-center gap-3 text-sm sm:col-span-2">
            <input type="checkbox" className="h-4 w-4 accent-[var(--brand)]" checked={s.invoiceRemindersEnabled} onChange={(e) => set("invoiceRemindersEnabled", e.target.checked)} />
            Send reminders automatically
          </label>
          <Field label="Reminder schedule (days relative to due date)" hint="Negative = before due. Default: -3, 0, 3, 7, 14" className="sm:col-span-2">
            <Input value={days} onChange={(e) => { setDays(e.target.value); setSaved(false); }} />
          </Field>
        </div>
      </Card>

      <div className="sticky bottom-4 flex justify-end">
        <Button onClick={save} disabled={pending} size="lg" className="shadow-lg">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : null}
          {saved ? "Saved" : "Save settings"}
        </Button>
      </div>
    </div>
  );
}
