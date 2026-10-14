import { schedules } from "@trigger.dev/sdk";
import { runJobs } from "@/lib/jobs";

/** Scheduled campaigns + follow-up sequence steps — every 10 minutes. */
export const outreachTick = schedules.task({
  id: "outreach-tick",
  cron: "*/10 * * * *",
  run: async () => runJobs(["campaigns", "followups"]),
});

/** Invoice reminders — daily at 14:00 UTC (morning in the US). */
export const invoiceReminders = schedules.task({
  id: "invoice-reminders",
  cron: "0 14 * * *",
  run: async () => runJobs(["reminders"]),
});
