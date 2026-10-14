"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutGrid,
  Users,
  Mail,
  Megaphone,
  Workflow,
  FileText,
  Receipt,
  Package,
  Settings,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { Avatar } from "@/components/ui";
import { authClient } from "@/lib/auth-client";
import { ThemeIconButton, ThemeRow, ThemeSwitch } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutGrid },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/inbox", label: "Inbox", icon: Mail, badgeKey: "unread" as const },
  { href: "/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/automations", label: "Automations", icon: Workflow },
  { href: "/proposals", label: "Proposals", icon: FileText },
  { href: "/invoices", label: "Invoices", icon: Receipt },
  { href: "/services", label: "Services", icon: Package },
];

function setCollapsed(collapsed: boolean) {
  const root = document.documentElement;
  if (collapsed) root.setAttribute("data-sidebar", "collapsed");
  else root.removeAttribute("data-sidebar");
  try {
    localStorage.setItem("sidebar", collapsed ? "collapsed" : "expanded");
  } catch {}
}

function toggleCollapsed() {
  setCollapsed(document.documentElement.getAttribute("data-sidebar") !== "collapsed");
}

/** Hover label shown next to icons while the sidebar is collapsed. */
function Tip({ children }: { children: React.ReactNode }) {
  return (
    <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 hidden -translate-y-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background opacity-0 shadow-lg transition-opacity group-hover:opacity-100 sb-collapsed:block">
      {children}
    </span>
  );
}

export function Sidebar({
  user,
  unread,
  appName,
}: {
  user: { name: string; email: string; image?: string | null };
  unread: number;
  appName: string;
}) {
  const pathname = usePathname();
  const router = useRouter();

  // ⌘B / Ctrl+B toggles the sidebar (ignored while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "b" || e.shiftKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      e.preventDefault();
      toggleCollapsed();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const item = (href: string, label: string, Icon: typeof LayoutGrid, badge?: number) => {
    const active = pathname === href || pathname.startsWith(href + "/");
    return (
      <Link
        key={href}
        href={href}
        aria-label={label}
        className={cn(
          "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[14px] transition-colors sb-collapsed:justify-center sb-collapsed:px-0",
          active ? "bg-brand-50 font-medium text-foreground" : "text-foreground/80 hover:bg-black/[.04]",
        )}
      >
        {active && <span className="absolute -left-3 top-1.5 bottom-1.5 w-1 rounded-r bg-brand" />}
        <span className="relative">
          <Icon className={cn("h-[18px] w-[18px]", active ? "text-brand" : "text-foreground/70")} strokeWidth={1.8} />
          {!!badge && <span className="absolute -right-1 -top-1 hidden h-2 w-2 rounded-full bg-brand ring-2 ring-surface sb-collapsed:block" />}
        </span>
        <span className="flex-1 truncate sb-collapsed:hidden">{label}</span>
        {!!badge && <span className="rounded-full bg-brand px-1.5 text-[11px] font-semibold text-white sb-collapsed:hidden">{badge}</span>}
        <Tip>
          {label}
          {badge ? ` (${badge})` : ""}
        </Tip>
      </Link>
    );
  };

  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-surface transition-[width] duration-200 ease-out md:flex sb-collapsed:w-[68px]">
      <div className="flex items-center gap-2 px-5 py-5 sb-collapsed:flex-col sb-collapsed:gap-3 sb-collapsed:px-0">
        <Link href="/dashboard" className="flex min-w-0 flex-1 items-center gap-2 sb-collapsed:flex-none" aria-label={appName}>
          <Logo />
          <span className="truncate text-lg font-bold tracking-tight sb-collapsed:hidden">{appName}</span>
        </Link>
        <button
          type="button"
          onClick={toggleCollapsed}
          className="group relative grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-black/[.05] hover:text-foreground"
          aria-label="Toggle sidebar"
          title="Collapse sidebar (⌘B)"
        >
          <PanelLeftClose className="h-[18px] w-[18px] sb-collapsed:hidden" strokeWidth={1.8} />
          <PanelLeftOpen className="hidden h-[18px] w-[18px] sb-collapsed:block" strokeWidth={1.8} />
          <Tip>Expand sidebar ⌘B</Tip>
        </button>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 sb-collapsed:overflow-visible">
        {nav.map((n) => item(n.href, n.label, n.icon, n.badgeKey ? unread : undefined))}
        <div className="my-3 border-t border-border" />
        {item("/settings", "Settings", Settings)}
      </nav>
      <div className="border-t border-border p-3">
        <div className="sb-collapsed:hidden">
          <ThemeRow />
        </div>
        <div className="group relative hidden justify-center sb-collapsed:flex">
          <ThemeIconButton />
          <Tip>Toggle theme</Tip>
        </div>
        <div className="mt-1 flex items-center gap-3 rounded-lg p-2 sb-collapsed:flex-col sb-collapsed:gap-2 sb-collapsed:px-0">
          <Link href="/settings" className="group relative" aria-label="Account settings">
            <Avatar name={user.name} src={user.image} size={34} />
            <Tip>{user.name}</Tip>
          </Link>
          <div className="min-w-0 flex-1 sb-collapsed:hidden">
            <p className="truncate text-sm font-semibold">{user.name}</p>
            <p className="truncate text-xs text-muted">{user.email}</p>
          </div>
          <button
            title="Sign out"
            aria-label="Sign out"
            className="rounded-md p-1.5 text-muted hover:bg-black/5 hover:text-foreground"
            onClick={async () => {
              await authClient.signOut();
              router.push("/login");
            }}
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}

export function MobileNav({ unread }: { unread: number }) {
  const pathname = usePathname();
  return (
    <nav className="sticky bottom-0 z-20 flex justify-around border-t border-border bg-surface py-2 md:hidden">
      {[...nav.slice(0, 5), { href: "/settings", label: "Settings", icon: Settings }].map(({ href, label, icon: Icon }) => {
        const active = pathname.startsWith(href);
        return (
          <Link key={href} href={href} className={cn("relative flex flex-col items-center gap-0.5 px-2 text-[10px]", active ? "text-brand" : "text-muted")}>
            <Icon className="h-5 w-5" />
            {label}
            {href === "/inbox" && unread > 0 && <span className="absolute -top-1 right-1 h-2 w-2 rounded-full bg-brand" />}
          </Link>
        );
      })}
      <div className="flex items-center px-1">
        <ThemeSwitch />
      </div>
    </nav>
  );
}

export function Logo({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <path d="M4 6h10l2 5-4 13L4 13V6z" fill="#fbb89e" />
      <path d="M28 6H18l-2 5 4 13 8-11V6z" fill="#f26b4e" />
      <path d="M12 24l4-13 4 13-4 4-4-4z" fill="#e0553a" />
    </svg>
  );
}
