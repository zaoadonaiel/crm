import type { Metadata } from "next";
import { UserX } from "lucide-react";
import { requireClient } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { PortalNav, SignOutButton } from "./portal-nav";
import { Logo } from "@/components/admin/sidebar";
import { ThemeSwitch } from "@/components/theme-toggle";

export const metadata: Metadata = { title: { default: "Client portal", template: "%s · Client portal" } };

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const [{ session, client }, s] = await Promise.all([requireClient(), getSettings()]);

  const brandMark = s.logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={s.logoUrl} alt={s.businessName} className="h-8 w-auto dark:rounded-lg dark:bg-white dark:p-1.5 dark:box-content" />
  ) : (
    <span className="flex items-center gap-2">
      <Logo size={26} />
      <span className="text-lg font-bold tracking-tight">{s.businessName}</span>
    </span>
  );

  if (!client) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <header className="border-b border-border bg-surface">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
            {brandMark}
            <ThemeSwitch />
            <SignOutButton />
          </div>
        </header>
        <main className="grid flex-1 place-items-center px-4 py-16">
          <div className="max-w-md rounded-2xl border border-border bg-surface p-8 text-center">
            <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-brand-50 text-brand">
              <UserX className="h-6 w-6" />
            </div>
            <h1 className="text-lg font-semibold">We couldn’t find your client profile</h1>
            <p className="mt-2 text-sm text-muted">
              You’re signed in as <span className="font-medium text-foreground">{session.user.email}</span>, but this email isn’t linked to a client account
              with {s.businessName} yet. Please reply to one of our emails or contact us and we’ll get you set up.
            </p>
            {s.fromEmail && (
              <a href={`mailto:${s.fromEmail}`} className="mt-5 inline-block text-sm font-medium text-brand hover:underline">
                Email {s.fromEmail}
              </a>
            )}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          {brandMark}
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold leading-tight">{client.name}</p>
              {client.company && <p className="text-xs text-muted">{client.company}</p>}
            </div>
            <ThemeSwitch />
            <SignOutButton />
          </div>
        </div>
        <PortalNav />
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      <footer className="border-t border-border py-6 text-center text-xs text-muted">
        {s.businessName}
        {s.address ? ` · ${s.address}` : ""}
      </footer>
    </div>
  );
}
