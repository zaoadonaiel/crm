/** Client-safe audience labels + helpers (no db imports). */
import type { Audience, ClientStatus } from "@/db/schema";

export type Segment = NonNullable<Audience["segment"]>;

export const SEGMENTS: { value: Segment; label: string; description: string }[] = [
  {
    value: "proposal_no_response",
    label: "Proposal — no response",
    description: "Sent or viewed a proposal but never replied afterwards.",
  },
  {
    value: "invoice_unpaid",
    label: "Unpaid invoice",
    description: "Has at least one open (unpaid) invoice.",
  },
  {
    value: "no_contact_90d",
    label: "Gone quiet (90+ days)",
    description: "You haven't emailed them in 90 days or more.",
  },
];

export const AUDIENCE_MODES: { value: Audience["mode"]; label: string; description: string }[] = [
  { value: "all", label: "All contacts", description: "Everyone in your CRM who hasn't unsubscribed." },
  { value: "statuses", label: "By status", description: "Leads, prospects, active or past clients." },
  { value: "tags", label: "By tag", description: "Anyone with at least one of the chosen tags." },
  { value: "clients", label: "Specific people", description: "Hand-pick exactly who receives it." },
  { value: "segment", label: "Smart segment", description: "Dynamic lists like “never replied to a proposal”." },
];

export function describeAudience(a: Audience): string {
  switch (a.mode) {
    case "all":
      return "All contacts";
    case "statuses":
      return a.statuses?.length ? `Status: ${a.statuses.map(cap).join(", ")}` : "Status: (none selected)";
    case "tags":
      return a.tags?.length ? `Tagged: ${a.tags.join(", ")}` : "Tags: (none selected)";
    case "clients":
      return `${a.clientIds?.length ?? 0} hand-picked contact${a.clientIds?.length === 1 ? "" : "s"}`;
    case "segment":
      return SEGMENTS.find((s) => s.value === a.segment)?.label ?? "Segment: (none selected)";
  }
}

function cap(s: ClientStatus) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
