"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FileText, Home, Loader2, LogOut, MessageSquare, Package, Receipt } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

const links = [
  { href: "/portal", label: "Overview", icon: Home },
  { href: "/portal/services", label: "Services", icon: Package },
  { href: "/portal/invoices", label: "Invoices", icon: Receipt },
  { href: "/portal/proposals", label: "Proposals", icon: FileText },
  { href: "/portal/messages", label: "Messages", icon: MessageSquare },
];

export function PortalNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Portal" className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-2 sm:px-4">
      {links.map(({ href, label, icon: Icon }) => {
        const active = href === "/portal" ? pathname === "/portal" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition-colors",
              active ? "border-brand font-semibold text-foreground" : "border-transparent text-muted hover:text-foreground",
            )}
          >
            <Icon className={cn("h-4 w-4", active ? "text-brand" : "")} aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <button
      type="button"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await authClient.signOut();
        router.push("/login");
        router.refresh();
      }}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-muted transition hover:bg-surface-2 hover:text-foreground disabled:opacity-60"
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
      <span className="hidden sm:inline">Sign out</span>
    </button>
  );
}
