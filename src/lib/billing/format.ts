/** Isomorphic helpers shared by admin + portal billing UIs. */

export type Interval = "one_time" | "month" | "year";
export const INTERVALS: Interval[] = ["month", "year", "one_time"];

export function intervalLabel(i: Interval | string, short = false) {
  if (i === "month") return short ? "/mo" : "Monthly";
  if (i === "year") return short ? "/yr" : "Yearly";
  return short ? "" : "One-time";
}

/** "12.50" / "$1,200" → 1250 / 120000 cents. Returns NaN for invalid input. */
export function parseMoneyToCents(v: FormDataEntryValue | string | null | undefined): number {
  const s = String(v ?? "")
    .replace(/[$,\s]/g, "")
    .trim();
  if (!s) return 0;
  if (!/^-?\d*(\.\d{0,2})?$/.test(s)) return NaN;
  return Math.round(parseFloat(s) * 100);
}

export function centsToInput(cents: number) {
  return (cents / 100).toFixed(2);
}

type InvoiceLike = { status: string; dueDate: Date | string | null };

/** Stripe status plus a computed "overdue" for open invoices past their due date. */
export function invoiceDisplayStatus(inv: InvoiceLike, now = new Date()) {
  if (inv.status === "open" && inv.dueDate && new Date(inv.dueDate).getTime() < startOfUtcDay(now).getTime()) return "overdue";
  return inv.status;
}

export function startOfUtcDay(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

const DAY = 86_400_000;
/** Whole days from `due` to `today` (UTC). Negative = due in the future. */
export function daysPastDue(due: Date, today = new Date()) {
  return Math.round((startOfUtcDay(today).getTime() - startOfUtcDay(due).getTime()) / DAY);
}

export function fmtDate(d: Date | string | null | undefined, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" }) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-US", { ...opts, timeZone: "UTC" }).format(new Date(d));
}
