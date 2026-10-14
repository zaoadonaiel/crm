"use client";

import { AlertTriangle, Inbox, Palette, SlidersHorizontal } from "lucide-react";
import type { EmailTheme } from "@/db/schema";
import { Card, CardHeader, Input, Select } from "@/components/ui";
import { subjectSpamHints } from "@/lib/campaigns/deliverability";
import { CAMPAIGN_KINDS, type CampaignKind } from "@/lib/campaigns/templates";
import { DEFAULT_THEME, FONT_OPTIONS, resolveTheme } from "@/lib/email/render-campaign";
import { mergeTags } from "@/lib/utils";
import { ColorField, FieldRow, RangeField, TagInput, ToggleField } from "./fields";
import type { BuilderCampaign, BuilderSettings, EditableFields } from "./types";

const SAMPLE = { first_name: "Alex", name: "Alex Sample", company: "Sample Co", email: "alex@example.com" };

export function SettingsEditor({
  campaign,
  settings,
  onChange,
}: {
  campaign: BuilderCampaign;
  settings: BuilderSettings;
  onChange: (patch: Partial<EditableFields>) => void;
}) {
  const theme = resolveTheme(campaign.theme, settings);
  const setTheme = (patch: Partial<EmailTheme>) => {
    const next: Partial<EmailTheme> = { ...campaign.theme, ...patch };
    for (const k of Object.keys(next) as (keyof EmailTheme)[]) if (next[k] === undefined) delete next[k];
    onChange({ theme: next });
  };
  const hints = subjectSpamHints(campaign.subject);
  const fromName = campaign.fromName || settings.fromName || settings.businessName;

  return (
    <div className="scroll-thin flex-1 overflow-y-auto">
      <div className="mx-auto grid max-w-5xl gap-6 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Email details" description="What recipients see in their inbox." icon={<Inbox className="h-5 w-5" />} />
            <div className="space-y-5 p-5">
              <TagInput
                label="Subject line"
                value={campaign.subject}
                onChange={(subject) => onChange({ subject })}
                placeholder="e.g. I built something new — want early access?"
                hint={
                  <span className={campaign.subject.length > 70 ? "text-warning" : undefined}>
                    {campaign.subject.length} characters · 30–50 works best on mobile
                  </span>
                }
              />
              {!campaign.subject.trim() && (
                <p className="-mt-3 flex items-center gap-1.5 text-xs text-danger">
                  <AlertTriangle className="h-3.5 w-3.5" /> A subject line is required.
                </p>
              )}
              {hints.length > 0 && (
                <ul className="-mt-2 space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800" aria-label="Subject line hints">
                  {hints.map((h) => (
                    <li key={h} className="flex gap-1.5">
                      <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" /> {h}
                    </li>
                  ))}
                </ul>
              )}
              <TagInput
                label="Preview text"
                value={campaign.previewText}
                onChange={(previewText) => onChange({ previewText })}
                placeholder="The short line shown after the subject in most inboxes"
                hint="Complements the subject — don't repeat it. 40–90 characters."
              />
              <div className="grid gap-5 sm:grid-cols-2">
                <FieldRow label="From name" hint={`Sent from ${settings.fromEmail}`}>
                  <Input
                    value={campaign.fromName ?? ""}
                    placeholder={settings.fromName || settings.businessName}
                    onChange={(e) => onChange({ fromName: e.target.value || null })}
                  />
                </FieldRow>
                <FieldRow label="Campaign type">
                  <Select value={campaign.kind} onChange={(e) => onChange({ kind: e.target.value as CampaignKind })}>
                    {CAMPAIGN_KINDS.map((k) => (
                      <option key={k.value} value={k.value}>
                        {k.label}
                      </option>
                    ))}
                  </Select>
                </FieldRow>
              </div>
              <FieldRow label="Internal name" hint="Only you see this.">
                <Input value={campaign.name} onChange={(e) => onChange({ name: e.target.value })} maxLength={200} />
              </FieldRow>
            </div>
          </Card>

          <Card>
            <CardHeader title="Replies" icon={<SlidersHorizontal className="h-5 w-5" />} />
            <div className="p-5">
              <ToggleField
                label="Track replies in the Inbox"
                description="Creates a conversation per recipient so replies thread into your Inbox and show on the campaign report. Recommended — replies are also a strong positive signal for deliverability."
                checked={campaign.trackReplies}
                onChange={(trackReplies) => onChange({ trackReplies })}
              />
            </div>
          </Card>

          <Card>
            <CardHeader title="Design" description="Colors, font and width for this email." icon={<Palette className="h-5 w-5" />} />
            <div className="grid gap-5 p-5 sm:grid-cols-2">
              <ColorField label="Brand / accent" value={campaign.theme.brandColor} placeholder={settings.brandColor || DEFAULT_THEME.brandColor} onChange={(brandColor) => setTheme({ brandColor })} />
              <ColorField label="Text" value={campaign.theme.textColor} placeholder={DEFAULT_THEME.textColor} onChange={(textColor) => setTheme({ textColor })} />
              <ColorField
                label="Page background"
                value={campaign.theme.backgroundColor}
                placeholder={DEFAULT_THEME.backgroundColor}
                onChange={(backgroundColor) => setTheme({ backgroundColor })}
              />
              <ColorField
                label="Content background"
                value={campaign.theme.contentBackground}
                placeholder={DEFAULT_THEME.contentBackground}
                onChange={(contentBackground) => setTheme({ contentBackground })}
              />
              <FieldRow label="Font">
                <Select value={theme.fontFamily} onChange={(e) => setTheme({ fontFamily: e.target.value })}>
                  {FONT_OPTIONS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </Select>
              </FieldRow>
              <RangeField label="Content width" value={theme.width} min={480} max={720} step={10} onChange={(width) => setTheme({ width })} />
            </div>
          </Card>
        </div>

        {/* Inbox mock */}
        <div className="lg:sticky lg:top-6 lg:self-start">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Inbox preview</p>
          <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
            {[0, 1].map((i) => (
              <div key={i} className={i === 0 ? "flex gap-3 border-b border-border p-4" : "flex gap-3 p-4 opacity-40"} aria-hidden={i > 0}>
                <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand text-sm font-semibold text-white" style={i === 0 ? { background: theme.brandColor } : { background: "#c7c9ce" }}>
                  {i === 0 ? fromName.charAt(0).toUpperCase() : "N"}
                </div>
                <div className="min-w-0 flex-1">
                  {i === 0 ? (
                    <>
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="truncate text-[14px] font-semibold">{fromName}</p>
                        <span className="shrink-0 text-[11px] text-muted">9:41 AM</span>
                      </div>
                      <p className="truncate text-[13px] font-medium">{mergeTags(campaign.subject, SAMPLE) || <span className="text-muted italic">No subject</span>}</p>
                      <p className="line-clamp-2 text-[13px] text-muted">{mergeTags(campaign.previewText, SAMPLE) || "Without preview text, inboxes show the first words of your email…"}</p>
                    </>
                  ) : (
                    <>
                      <div className="h-3 w-24 rounded bg-black/10" />
                      <div className="mt-2 h-2.5 w-40 rounded bg-black/10" />
                      <div className="mt-1.5 h-2.5 w-full rounded bg-black/5" />
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-muted">Merge tags shown with sample data (Alex from Sample Co).</p>
        </div>
      </div>
    </div>
  );
}
