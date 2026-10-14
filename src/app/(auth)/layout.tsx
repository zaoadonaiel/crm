import { Logo } from "@/components/admin/sidebar";
import { getSettings } from "@/lib/settings";
import { ThemeSwitch } from "@/components/theme-toggle";

export default async function AuthLayout({ children }: LayoutProps<"/">) {
  const s = await getSettings().catch(() => null);
  const name = s?.businessName ?? "Davey CRM";
  return (
    <div className="grid min-h-screen bg-surface lg:grid-cols-[1.15fr_1fr]">
      <div className="relative flex flex-col px-6 py-10 sm:px-12">
        <ThemeSwitch className="absolute right-6 top-6" />
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center">
          <div className="mb-8 flex items-center justify-center gap-3">
            {s?.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={s.logoUrl} alt={name} className="h-12 dark:rounded-lg dark:bg-white dark:p-1.5 dark:box-content" />
            ) : (
              <>
                <Logo size={44} />
                <span className="text-4xl font-bold tracking-tight">{name}</span>
              </>
            )}
          </div>
          {children}
        </div>
      </div>
      <div className="relative hidden items-center justify-center overflow-hidden bg-gradient-to-br from-[#fff4ef] via-[#ffe9e1] to-[#fff7f3] lg:flex dark:from-[#1d1411] dark:via-[#24150f] dark:to-[#15171c]">
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand/10" />
        <div className="absolute -bottom-20 -left-16 h-60 w-60 rounded-full bg-brand/10" />
        <div className="relative mx-12 max-w-md rounded-3xl bg-surface/90 p-10 text-center shadow-xl shadow-brand/10 backdrop-blur">
          <div className="text-6xl font-black leading-none text-brand/30">“</div>
          <p className="mt-2 text-xl font-medium italic leading-relaxed text-foreground/90">
            Everything about working with you in one place: your services, invoices, and a direct line to our team.
          </p>
          <p className="mt-6 font-semibold">{name}</p>
          <p className="text-sm text-muted">Client portal</p>
        </div>
      </div>
    </div>
  );
}
