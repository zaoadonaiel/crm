import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CheckCircle2, MailX, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui";
import { emailFromToken, getSuppression, resubscribeEmail, unsubscribeEmail } from "@/lib/campaigns/unsubscribe";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = {
  title: "Email preferences",
  robots: { index: false, follow: false },
};

async function unsubscribeAction(token: string) {
  "use server";
  const email = await emailFromToken(token);
  if (email) await unsubscribeEmail(email, "page");
  redirect(`/u/${encodeURIComponent(token)}?done=unsubscribed`);
}

async function resubscribeAction(token: string) {
  "use server";
  const email = await emailFromToken(token);
  if (email) await resubscribeEmail(email);
  redirect(`/u/${encodeURIComponent(token)}?done=resubscribed`);
}

function maskEmail(email: string) {
  const [user = "", domain = ""] = email.split("@");
  const visible = user.length <= 2 ? user.slice(0, 1) : user.slice(0, 2);
  return `${visible}${"•".repeat(Math.max(1, Math.min(6, user.length - visible.length)))}@${domain}`;
}

export default async function UnsubscribePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ done?: string }>;
}) {
  const [{ token }, { done }, s] = await Promise.all([params, searchParams, getSettings()]);
  const email = await emailFromToken(token);
  const suppression = email ? await getSuppression(email) : undefined;
  const unsubscribed = !!suppression;

  return (
    <main className="grid min-h-screen place-items-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          {s.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={s.logoUrl} alt={s.businessName} className="h-9 w-auto dark:rounded-lg dark:bg-white dark:p-1.5 dark:box-content" />
          ) : (
            <span className="text-lg font-bold tracking-tight">{s.businessName}</span>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-surface p-8 text-center shadow-sm">
          {!email ? (
            <>
              <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-red-50 text-red-600">
                <ShieldAlert className="h-6 w-6" aria-hidden />
              </div>
              <h1 className="text-lg font-semibold">This link isn&apos;t valid</h1>
              <p className="mt-2 text-sm text-muted">
                The unsubscribe link looks incomplete or has been changed. Please use the link from the most recent email, or
                simply reply to it and ask to be removed.
              </p>
            </>
          ) : unsubscribed ? (
            <>
              <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-green-50 text-green-600">
                <CheckCircle2 className="h-6 w-6" aria-hidden />
              </div>
              <h1 className="text-lg font-semibold">You&apos;re unsubscribed</h1>
              <p className="mt-2 text-sm text-muted">
                <span className="font-medium text-foreground">{maskEmail(email)}</span> won&apos;t receive newsletters or
                announcements from {s.businessName} anymore. You may still get replies to conversations you start, and
                receipts or invoices.
              </p>
              {suppression?.reason === "unsubscribed" && (
                <form action={resubscribeAction.bind(null, token)} className="mt-6">
                  <p className="mb-3 text-xs text-muted">Unsubscribed by mistake?</p>
                  <Button type="submit" variant="outline">
                    Resubscribe
                  </Button>
                </form>
              )}
            </>
          ) : (
            <>
              <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-brand-50 text-brand">
                <MailX className="h-6 w-6" aria-hidden />
              </div>
              <h1 className="text-lg font-semibold">
                {done === "resubscribed" ? "Welcome back!" : `Unsubscribe from ${s.businessName}?`}
              </h1>
              <p className="mt-2 text-sm text-muted">
                {done === "resubscribed" ? (
                  <>
                    <span className="font-medium text-foreground">{maskEmail(email)}</span> is subscribed again. You can
                    unsubscribe at any time.
                  </>
                ) : (
                  <>
                    <span className="font-medium text-foreground">{maskEmail(email)}</span> will stop receiving newsletters
                    and announcements. No hard feelings.
                  </>
                )}
              </p>
              <form action={unsubscribeAction.bind(null, token)} className="mt-6">
                <Button type="submit" size="lg" className="w-full justify-center">
                  Unsubscribe
                </Button>
              </form>
            </>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-muted">
          {s.businessName}
          {s.address ? ` · ${s.address}` : ""}
        </p>
      </div>
    </main>
  );
}
