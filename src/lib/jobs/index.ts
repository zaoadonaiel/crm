/**
 * Every recurring job in one place. Called by Trigger.dev scheduled tasks
 * (trigger/*.ts) or by POST /api/cron from any scheduler.
 */
import { processScheduledCampaigns } from "@/lib/campaigns/send";
import { processDueEnrollments } from "@/lib/automations/run";
import { sendInvoiceReminders } from "@/lib/billing/reminders";

export const jobs = {
  campaigns: processScheduledCampaigns,
  followups: processDueEnrollments,
  reminders: sendInvoiceReminders,
} as const;

export type JobName = keyof typeof jobs;

export async function runJobs(names: JobName[] = Object.keys(jobs) as JobName[]) {
  const results: Record<string, unknown> = {};
  for (const name of names) {
    try {
      results[name] = await jobs[name]();
    } catch (err) {
      console.error(`[job:${name}]`, err);
      results[name] = { error: err instanceof Error ? err.message : String(err) };
    }
  }
  return results;
}
