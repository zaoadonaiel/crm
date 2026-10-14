"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button, Field, Input } from "@/components/ui";

export function SetupForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setLoading(true);
    setError(null);
    const { error } = await authClient.signUp.email({
      name: String(f.get("name")),
      email: String(f.get("email")),
      password: String(f.get("password")),
    });
    setLoading(false);
    if (error) return setError(error.message ?? "Could not create account");
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div>
      <h1 className="text-center text-2xl font-medium">Create your admin account</h1>
      <p className="mb-8 mt-2 text-center text-sm text-muted">This is a one-time setup. You&apos;ll be the owner of this CRM.</p>
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Your name">
          <Input name="name" required placeholder="Davey Smith" className="h-11" />
        </Field>
        <Field label="Email">
          <Input name="email" type="email" required placeholder="you@yourdomain.com" className="h-11" />
        </Field>
        <Field label="Password" hint="At least 8 characters">
          <Input name="password" type="password" required minLength={8} className="h-11" />
        </Field>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-danger">{error}</p>}
        <Button size="lg" className="w-full justify-center" disabled={loading}>
          {loading && <Loader2 className="h-4 w-4 animate-spin" />} Create admin account
        </Button>
      </form>
    </div>
  );
}
