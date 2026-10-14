"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui";

export function InvoiceSearch({ q, status }: { q: string; status: string }) {
  const router = useRouter();
  const [value, setValue] = useState(q);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const go = (v: string) => {
    const qs = new URLSearchParams();
    if (v.trim()) qs.set("q", v.trim());
    if (status !== "all") qs.set("status", status);
    router.replace(`/invoices${qs.size ? `?${qs}` : ""}`);
  };
  return (
    <form
      role="search"
      className="relative w-64 max-w-full"
      onSubmit={(e) => {
        e.preventDefault();
        go(value);
      }}
    >
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
      <Input
        aria-label="Search invoices"
        placeholder="Search client or number"
        value={value}
        className="h-9 pl-9"
        onChange={(e) => {
          const v = e.target.value;
          setValue(v);
          clearTimeout(timer.current);
          timer.current = setTimeout(() => go(v), 350);
        }}
      />
    </form>
  );
}
