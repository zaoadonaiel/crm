export type SequenceTrigger = "proposal_sent" | "invoice_sent" | "manual";

export const TRIGGERS: { value: SequenceTrigger; label: string; short: string; description: string }[] = [
  {
    value: "proposal_sent",
    label: "When a proposal is sent (no reply)",
    short: "Proposal sent",
    description: "Starts when you send a proposal. Stops automatically once it's accepted or declined.",
  },
  {
    value: "invoice_sent",
    label: "When an invoice is sent (unpaid)",
    short: "Invoice sent",
    description: "Starts when an invoice is sent. Stops automatically once it's paid or voided.",
  },
  {
    value: "manual",
    label: "Manual enrollment",
    short: "Manual",
    description: "Only runs for clients you enroll yourself.",
  },
];

export const triggerInfo = (t: string) => TRIGGERS.find((x) => x.value === t) ?? TRIGGERS[2]!;

export const BASE_TAGS = [
  { tag: "{{first_name}}", label: "First name" },
  { tag: "{{name}}", label: "Full name" },
  { tag: "{{company}}", label: "Company" },
  { tag: "{{sender_name}}", label: "Your name" },
  { tag: "{{business_name}}", label: "Business name" },
];

export const TRIGGER_TAGS: Record<SequenceTrigger, { tag: string; label: string }[]> = {
  proposal_sent: [
    { tag: "{{proposal_title}}", label: "Proposal title" },
    { tag: "{{proposal_link}}", label: "Proposal link" },
    { tag: "{{proposal_amount}}", label: "Proposal amount" },
  ],
  invoice_sent: [
    { tag: "{{invoice_number}}", label: "Invoice number" },
    { tag: "{{invoice_amount}}", label: "Amount due" },
    { tag: "{{invoice_link}}", label: "Payment link" },
    { tag: "{{due_date}}", label: "Due date" },
  ],
  manual: [],
};

export const STOP_REASONS: Record<string, string> = {
  replied: "Replied",
  manual: "Stopped manually",
  missing: "Client or sequence removed",
  proposal_accepted: "Proposal accepted",
  proposal_declined: "Proposal declined",
  proposal_deleted: "Proposal deleted",
  invoice_paid: "Invoice paid",
  invoice_void: "Invoice voided",
  invoice_uncollectible: "Invoice uncollectible",
  invoice_deleted: "Invoice deleted",
  suppressed_bounced: "Email bounced",
  suppressed_complained: "Marked as spam",
  suppressed_unsubscribed: "Unsubscribed",
  suppressed_manual: "Suppressed",
};

export const stopReasonLabel = (r: string | null) => (r ? (STOP_REASONS[r] ?? r.replace(/_/g, " ")) : null);
