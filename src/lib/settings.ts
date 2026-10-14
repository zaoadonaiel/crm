import { eq } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";

export type AppSettings = {
  businessName: string;
  logoUrl: string;
  brandColor: string;
  /** Display name on outgoing email, e.g. "Davey at Acme Studio" */
  fromName: string;
  /** Must be on a domain verified in Resend/Mailgun, e.g. hello@mail.yourdomain.com */
  fromEmail: string;
  /** Physical mailing address — legally required in marketing email footers (CAN-SPAM) */
  address: string;
  /** Signature appended to 1:1 replies and follow-ups */
  signature: string;
  /** Days relative to due date when invoice reminders go out (negative = before due) */
  invoiceReminderDays: number[];
  /** Automatically send invoice reminders */
  invoiceRemindersEnabled: boolean;
};

export const DEFAULT_SETTINGS: AppSettings = {
  businessName: process.env.NEXT_PUBLIC_APP_NAME || "Davey CRM",
  logoUrl: "",
  brandColor: "#f26b4e",
  fromName: process.env.EMAIL_FROM_NAME || "Davey",
  fromEmail: process.env.EMAIL_FROM || "hello@example.com",
  address: "",
  signature: "",
  invoiceReminderDays: [-3, 0, 3, 7, 14],
  invoiceRemindersEnabled: true,
};

export async function getSettings(): Promise<AppSettings> {
  const row = await db.query.settings.findFirst({ where: eq(settings.key, "app") });
  return { ...DEFAULT_SETTINGS, ...((row?.value as Partial<AppSettings>) ?? {}) };
}

export async function saveSettings(patch: Partial<AppSettings>) {
  const current = await getSettings();
  const value = { ...current, ...patch };
  await db
    .insert(settings)
    .values({ key: "app", value })
    .onConflictDoUpdate({ target: settings.key, set: { value } });
  return value;
}
