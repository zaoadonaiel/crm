"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Button, Field, Input } from "@/components/ui";

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  return sent ? (
    <p className="text-center text-sm text-muted">If that email has an account, a reset link is on its way.</p>
  ) : (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setLoading(true);
        const email = String(new FormData(e.currentTarget).get("email"));
        await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" });
        setLoading(false);
        setSent(true);
      }}
    >
      <h1 className="mb-6 text-center text-2xl font-medium">Reset your password</h1>
      <Field label="Email">
        <Input name="email" type="email" required className="h-11" />
      </Field>
      <Button size="lg" className="w-full justify-center" disabled={loading}>
        Send reset link
      </Button>
      <p className="text-center text-sm">
        <Link href="/login" className="text-muted hover:text-brand">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}

export function ResetPasswordForm() {
  const params = useSearchParams();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const newPassword = String(new FormData(e.currentTarget).get("password"));
        const { error } = await authClient.resetPassword({ newPassword, token: params.get("token") ?? "" });
        if (error) return setError(error.message ?? "Reset failed");
        router.push("/login");
      }}
    >
      <h1 className="mb-6 text-center text-2xl font-medium">Choose a new password</h1>
      <Field label="New password" hint="At least 8 characters">
        <Input name="password" type="password" minLength={8} required className="h-11" />
      </Field>
      {error && <p className="text-sm text-danger">{error}</p>}
      <Button size="lg" className="w-full justify-center">
        Save password
      </Button>
    </form>
  );
}
