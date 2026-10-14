import { Settings } from "lucide-react";
import { requireAdmin } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { appUrl } from "@/lib/utils";
import { PageHeader } from "@/components/ui";
import { SettingsForm } from "@/components/settings/settings-form";
import { Integrations, type Integration } from "@/components/settings/integrations";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requireAdmin();
  const s = await getSettings();
  const env = process.env;
  const provider = (env.EMAIL_PROVIDER || "resend").toLowerCase();
  const dbUrl = env.DATABASE_URL ?? "";

  const items: Integration[] = [
    { name: "Database", ok: !!dbUrl, detail: dbUrl.includes("neon.tech") ? "Neon Postgres" : dbUrl ? "Local Postgres (dev)" : "DATABASE_URL missing" },
    {
      name: "Email sending",
      ok: provider === "mailgun" ? !!env.MAILGUN_API_KEY : !!env.RESEND_API_KEY,
      detail:
        provider === "mailgun"
          ? env.MAILGUN_API_KEY ? `Mailgun · ${env.MAILGUN_DOMAIN}` : "MAILGUN_API_KEY missing, emails print to console"
          : env.RESEND_API_KEY ? "Resend" : "RESEND_API_KEY missing, emails print to console",
    },
    { name: "Reply capture", ok: !!env.INBOUND_EMAIL_DOMAIN, detail: env.INBOUND_EMAIL_DOMAIN ? `reply+…@${env.INBOUND_EMAIL_DOMAIN}` : "INBOUND_EMAIL_DOMAIN not set, replies go to your From address" },
    { name: "Email webhooks", ok: !!(env.RESEND_WEBHOOK_SECRET || env.MAILGUN_WEBHOOK_SIGNING_KEY), detail: env.RESEND_WEBHOOK_SECRET || env.MAILGUN_WEBHOOK_SIGNING_KEY ? "Opens, clicks, bounces tracked" : "Webhook secret missing" },
    { name: "Stripe", ok: !!env.STRIPE_SECRET_KEY, detail: env.STRIPE_SECRET_KEY ? (env.STRIPE_SECRET_KEY.startsWith("sk_live") ? "Live mode" : "Test mode") + (env.STRIPE_WEBHOOK_SECRET ? " · webhook set" : " · webhook secret missing") : "STRIPE_SECRET_KEY missing" },
    { name: "Trigger.dev", ok: !!env.TRIGGER_SECRET_KEY, detail: env.TRIGGER_SECRET_KEY ? "Background jobs on Trigger.dev" : "Not set: use “Run jobs now” or /api/cron" },
    { name: "Google sign-in", ok: !!env.GOOGLE_CLIENT_ID, detail: env.GOOGLE_CLIENT_ID ? "Enabled" : "Optional" },
  ];

  const webhooks = [
    { label: "Resend webhook", url: appUrl("/api/webhooks/resend") },
    { label: "Mailgun (routes + events)", url: appUrl("/api/webhooks/mailgun") },
    { label: "Stripe webhook", url: appUrl("/api/webhooks/stripe") },
    { label: "Cron (POST, Bearer)", url: appUrl("/api/cron") },
  ];

  return (
    <>
      <PageHeader icon={<Settings className="h-5 w-5" />} title="Settings" description="Brand, sending identity, reminders and integrations" />
      <div className="mx-auto grid max-w-6xl gap-5 p-4 sm:p-6 lg:grid-cols-[1.3fr_1fr]">
        <SettingsForm initial={s} />
        <Integrations items={items} webhooks={webhooks} />
      </div>
    </>
  );
}
