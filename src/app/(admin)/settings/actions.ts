"use server";

import { revalidatePath } from "next/cache";
import { assertAdmin } from "@/lib/session";
import { saveSettings, type AppSettings } from "@/lib/settings";
import { runJobs, type JobName } from "@/lib/jobs";
import { sendEmail } from "@/lib/email/send";
import { noticeEmailHtml } from "@/lib/email/transactional";

export async function updateSettings(patch: Partial<AppSettings>) {
  await assertAdmin();
  if (patch.invoiceReminderDays) {
    patch.invoiceReminderDays = [...new Set(patch.invoiceReminderDays.filter((n) => Number.isFinite(n)))].sort((a, b) => a - b);
  }
  if (patch.fromEmail) patch.fromEmail = patch.fromEmail.trim().toLowerCase();
  await saveSettings(patch);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function runJobsNow(names?: JobName[]) {
  await assertAdmin();
  return runJobs(names);
}

export async function sendTestTransactional(to: string) {
  await assertAdmin();
  try {
    const r = await sendEmail({
      to,
      subject: "Test email from your CRM",
      html: await noticeEmailHtml({
        heading: "It works 🎉",
        bodyText: "Your email provider is connected. Check this landed in your inbox (not spam or promotions).",
      }),
    });
    return { ok: true, id: r.id, provider: r.provider };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
