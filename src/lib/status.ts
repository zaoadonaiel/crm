import type { Tone } from "@/components/ui";

const map: Record<string, Tone> = {
  // clients
  lead: "blue",
  prospect: "amber",
  active: "green",
  past: "gray",
  // proposals
  draft: "gray",
  sent: "blue",
  viewed: "purple",
  accepted: "green",
  declined: "red",
  // invoices
  open: "amber",
  paid: "green",
  void: "gray",
  uncollectible: "red",
  overdue: "red",
  // campaigns
  scheduled: "purple",
  sending: "amber",
  failed: "red",
  // services
  pending: "amber",
  paused: "gray",
  cancelled: "red",
  // conversations / enrollments
  interested: "brand",
  closed: "gray",
  completed: "green",
  stopped: "gray",
  // recipients
  queued: "gray",
  delivered: "blue",
  opened: "purple",
  clicked: "green",
  bounced: "red",
  complained: "red",
  skipped: "gray",
};

export function statusTone(status: string): Tone {
  return map[status] ?? "gray";
}
