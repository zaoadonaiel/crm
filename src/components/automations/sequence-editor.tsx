"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, Braces, Check, Clock, Info, Loader2, Mail, Plus, Trash2 } from "lucide-react";
import type { SequenceStep } from "@/db/schema";
import { Button, Card, CardHeader, Select } from "@/components/ui";
import { deleteSequence, saveSequence } from "@/app/(admin)/automations/actions";
import { MenuItem, Popover } from "@/components/inbox/overlay";
import { cn } from "@/lib/utils";
import { ActiveToggle, Switch } from "./list-controls";
import { BASE_TAGS, TRIGGER_TAGS, TRIGGERS, triggerInfo, type SequenceTrigger } from "./constants";

type EditableSequence = {
  id: string;
  name: string;
  trigger: SequenceTrigger;
  stopOnReply: boolean;
  active: boolean;
  steps: SequenceStep[];
};

type Draft = Pick<EditableSequence, "name" | "trigger" | "stopOnReply" | "steps">;

const newStepId = () => Math.random().toString(36).slice(2, 12);

export function SequenceEditor({ sequence, activeEnrollments }: { sequence: EditableSequence; activeEnrollments: number }) {
  const init = (): Draft => ({ name: sequence.name, trigger: sequence.trigger, stopOnReply: sequence.stopOnReply, steps: sequence.steps });
  const [baseline, setBaseline] = React.useState<Draft>(init);
  const [draft, setDraft] = React.useState<Draft>(init);
  const [error, setError] = React.useState<string | null>(null);
  const [savedAt, setSavedAt] = React.useState<number | null>(null);
  const [saving, startSaving] = React.useTransition();
  const [deleting, startDeleting] = React.useTransition();
  const bodyRefs = React.useRef(new Map<string, HTMLTextAreaElement>());

  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);

  React.useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const setStep = (id: string, patch: Partial<SequenceStep>) =>
    setDraft((d) => ({ ...d, steps: d.steps.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));

  const move = (i: number, dir: -1 | 1) =>
    setDraft((d) => {
      const steps = [...d.steps];
      const j = i + dir;
      if (j < 0 || j >= steps.length) return d;
      [steps[i], steps[j]] = [steps[j]!, steps[i]!];
      return { ...d, steps };
    });

  const addStep = () =>
    setDraft((d) => ({
      ...d,
      steps: [...d.steps, { id: newStepId(), delayDays: d.steps.length ? 4 : 3, subject: d.steps.length ? "" : "Quick follow-up", body: "Hi {{first_name}},\n\n" }],
    }));

  const insertTag = (stepId: string, tag: string) => {
    const el = bodyRefs.current.get(stepId);
    const step = draft.steps.find((s) => s.id === stepId);
    if (!step) return;
    const start = el?.selectionStart ?? step.body.length;
    const end = el?.selectionEnd ?? step.body.length;
    setStep(stepId, { body: step.body.slice(0, start) + tag + step.body.slice(end) });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + tag.length, start + tag.length);
    });
  };

  const save = () => {
    setError(null);
    startSaving(async () => {
      const res = await saveSequence(sequence.id, draft);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setBaseline(draft);
      setSavedAt(Date.now());
    });
  };

  const tags = [...BASE_TAGS, ...TRIGGER_TAGS[draft.trigger]];
  const dayOf = draft.steps.reduce<number[]>((acc, st) => [...acc, (acc[acc.length - 1] ?? 0) + (Number(st.delayDays) || 0)], []);
  const info = triggerInfo(draft.trigger);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="space-y-6"
    >
      {/* Title bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="sr-only" htmlFor="seq-name">
          Sequence name
        </label>
        <input
          id="seq-name"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          maxLength={120}
          required
          className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 text-xl font-semibold outline-none hover:border-border focus:border-brand focus:bg-surface focus:ring-3 focus:ring-brand/15"
        />
        <div className="flex items-center gap-3">
          <ActiveToggle id={sequence.id} active={sequence.active} name={sequence.name} />
          <Button type="submit" disabled={!dirty || saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : !dirty && savedAt ? <Check className="h-4 w-4" /> : null}
            {dirty ? "Save changes" : savedAt ? "Saved" : "Save"}
          </Button>
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          {error}
        </p>
      )}
      {!sequence.active && (
        <p className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-[13px] text-amber-800">
          <Info className="h-4 w-4 shrink-0" />
          This sequence is paused. Nothing is sent and new {draft.trigger === "manual" ? "enrollments wait" : "triggers are ignored"} until you activate it.
        </p>
      )}

      {/* Settings */}
      <Card>
        <CardHeader title="Trigger & rules" description="When clients enter this sequence, and when they leave it." />
        <div className="grid gap-5 p-5 md:grid-cols-2">
          <div>
            <label htmlFor="seq-trigger" className="mb-1.5 block text-[13px] font-medium">
              Trigger
            </label>
            <Select id="seq-trigger" value={draft.trigger} onChange={(e) => setDraft({ ...draft, trigger: e.target.value as SequenceTrigger })}>
              {TRIGGERS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
            <p className="mt-1.5 text-xs text-muted">{info.description}</p>
          </div>
          <div className="space-y-1.5">
            <p className="text-[13px] font-medium">Stop on reply</p>
            <Switch
              checked={draft.stopOnReply}
              onChange={(v) => setDraft({ ...draft, stopOnReply: v })}
              label="Stop the sequence as soon as the client replies"
              showLabel
            />
            <p className="text-xs text-muted">Recommended. Replies land in your Inbox so you can take it from there.</p>
          </div>
        </div>
      </Card>

      {/* Steps */}
      <Card>
        <CardHeader
          title="Steps"
          description="Plain-text emails sent from you, in the same thread. Your signature is added automatically."
          icon={<Mail className="h-5 w-5" />}
        />
        {activeEnrollments > 0 && (
          <p className="flex items-start gap-2 border-b border-border bg-blue-50/60 px-5 py-2.5 text-[13px] text-blue-800">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            {activeEnrollments} {activeEnrollments === 1 ? "client is" : "clients are"} currently in this sequence. Edits apply to their upcoming steps.
          </p>
        )}
        <ol className="space-y-0 p-3 sm:p-5">
          {draft.steps.map((step, i) => {
            const first = i === 0;
            return (
              <li key={step.id} className="relative pl-9 sm:pl-11">
                {/* Timeline */}
                <span className="absolute left-3 top-0 h-full w-px bg-border sm:left-4" aria-hidden />
                <span
                  className="absolute left-0 top-4 grid h-6 w-6 place-items-center rounded-full bg-brand text-[11px] font-bold text-white ring-4 ring-surface sm:left-1 sm:h-7 sm:w-7"
                  aria-hidden
                >
                  {i + 1}
                </span>
                <div className="pb-5">
                  <div className="mb-2 flex flex-wrap items-center gap-2 pt-4 text-[13px] text-muted">
                    <Clock className="h-3.5 w-3.5" />
                    <span>Wait</span>
                    <label className="sr-only" htmlFor={`delay-${step.id}`}>
                      Days to wait before step {i + 1}
                    </label>
                    <input
                      id={`delay-${step.id}`}
                      type="number"
                      min={0}
                      max={365}
                      value={step.delayDays}
                      onChange={(e) => setStep(step.id, { delayDays: Math.max(0, Math.min(365, Number(e.target.value) || 0)) })}
                      className="h-7 w-16 rounded-md border border-border bg-surface px-2 text-center text-[13px] text-foreground outline-none focus:border-brand"
                    />
                    <span>
                      {step.delayDays === 1 ? "day" : "days"} after {first ? "enrollment" : "the previous step"}
                    </span>
                    <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium">Day {dayOf[i]}</span>
                  </div>
                  <div className="rounded-xl border border-border bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
                    <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                      <label className="sr-only" htmlFor={`subject-${step.id}`}>
                        Step {i + 1} subject
                      </label>
                      <input
                        id={`subject-${step.id}`}
                        value={step.subject}
                        onChange={(e) => setStep(step.id, { subject: e.target.value })}
                        placeholder={first ? "Subject" : "Subject (optional — replies in the same thread)"}
                        maxLength={300}
                        className="min-w-0 flex-1 bg-transparent py-1 text-sm font-medium outline-none placeholder:font-normal placeholder:text-muted/70"
                      />
                      <div className="flex items-center">
                        <IconBtn label="Move step up" disabled={first} onClick={() => move(i, -1)}>
                          <ArrowUp className="h-4 w-4" />
                        </IconBtn>
                        <IconBtn label="Move step down" disabled={i === draft.steps.length - 1} onClick={() => move(i, 1)}>
                          <ArrowDown className="h-4 w-4" />
                        </IconBtn>
                        <IconBtn
                          label="Delete step"
                          danger
                          disabled={draft.steps.length === 1}
                          onClick={() => setDraft({ ...draft, steps: draft.steps.filter((s) => s.id !== step.id) })}
                        >
                          <Trash2 className="h-4 w-4" />
                        </IconBtn>
                      </div>
                    </div>
                    <label className="sr-only" htmlFor={`body-${step.id}`}>
                      Step {i + 1} message
                    </label>
                    <textarea
                      id={`body-${step.id}`}
                      ref={(el) => {
                        if (el) bodyRefs.current.set(step.id, el);
                        else bodyRefs.current.delete(step.id);
                      }}
                      value={step.body}
                      onChange={(e) => setStep(step.id, { body: e.target.value })}
                      rows={6}
                      className="block min-h-36 w-full resize-y bg-transparent px-3 py-2.5 text-sm leading-relaxed outline-none [field-sizing:content]"
                    />
                    <div className="flex items-center justify-between gap-2 border-t border-black/5 px-2 py-1">
                      <Popover
                        side="top"
                        align="left"
                        trigger={({ toggle, ...aria }) => (
                          <button
                            type="button"
                            onClick={toggle}
                            className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted hover:bg-black/5 hover:text-foreground"
                            {...aria}
                          >
                            <Braces className="h-3.5 w-3.5" /> Insert merge tag
                          </button>
                        )}
                      >
                        {(close) => (
                          <div role="menu" className="w-64">
                            {tags.map((t) => (
                              <MenuItem
                                key={t.tag}
                                onClick={() => {
                                  insertTag(step.id, t.tag);
                                  close();
                                }}
                              >
                                <span className="flex-1">{t.label}</span>
                                <code className="text-[11px] text-muted">{t.tag}</code>
                              </MenuItem>
                            ))}
                          </div>
                        )}
                      </Popover>
                      <span className="hidden text-[11px] text-muted sm:inline">
                        Fallbacks: <code>{"{{first_name|there}}"}</code>
                      </span>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
        <div className="border-t border-border px-5 py-3">
          <Button type="button" variant="secondary" size="sm" onClick={addStep} disabled={draft.steps.length >= 20}>
            <Plus className="h-4 w-4" /> Add step
          </Button>
        </div>
      </Card>

      {/* Danger zone */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-surface px-5 py-4">
        <div>
          <p className="text-sm font-semibold">Delete sequence</p>
          <p className="text-[13px] text-muted">Removes the sequence and all of its enrollments. Sent emails stay in the Inbox.</p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="border-red-200 text-danger hover:bg-red-50"
          disabled={deleting}
          onClick={() => {
            if (!window.confirm(`Delete “${sequence.name}”? This can't be undone.`)) return;
            startDeleting(() => deleteSequence(sequence.id));
          }}
        >
          {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Delete
        </Button>
      </div>
    </form>
  );
}

function IconBtn({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "rounded-md p-1.5 text-muted transition-colors disabled:pointer-events-none disabled:opacity-30",
        danger ? "hover:bg-red-50 hover:text-danger" : "hover:bg-black/5 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
