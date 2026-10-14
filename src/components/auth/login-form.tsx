"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogIn, Mail, Eye, EyeOff, Loader2 } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button, Input, Label } from "@/components/ui";

export function LoginForm({ googleEnabled }: { googleEnabled: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<"password" | "magic">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    if (mode === "magic") {
      const { error } = await authClient.signIn.magicLink({ email, callbackURL: "/portal" });
      setLoading(false);
      if (error) return setError(error.message ?? "Could not send link");
      return setSent(true);
    }
    const { data, error } = await authClient.signIn.email({ email, password });
    setLoading(false);
    if (error) return setError(error.message ?? "Invalid email or password");
    const role = (data?.user as { role?: string } | undefined)?.role;
    router.push(role === "admin" ? "/dashboard" : "/portal");
    router.refresh();
  }

  if (sent) {
    return (
      <div className="rounded-xl border border-border bg-surface-2 p-6 text-center">
        <Mail className="mx-auto mb-3 h-8 w-8 text-brand" />
        <p className="font-semibold">Check your inbox</p>
        <p className="mt-1 text-sm text-muted">We sent a sign-in link to {email}.</p>
        <button className="mt-4 text-sm font-medium text-brand" onClick={() => setSent(false)}>
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-8 text-center text-2xl font-medium">Sign in to your account</h1>
      <form onSubmit={onSubmit} className="space-y-5">
        <div>
          <Label htmlFor="email">Email address</Label>
          <Input id="email" type="email" required autoComplete="email" placeholder="Enter your email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-12" />
        </div>
        {mode === "password" && (
          <div>
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                id="password"
                type={show ? "text" : "password"}
                required
                autoComplete="current-password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-12 pr-11"
              />
              <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted" aria-label="Toggle password">
                {show ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
              </button>
            </div>
            <div className="mt-2 text-right">
              <Link href="/forgot-password" className="text-sm font-medium hover:text-brand">
                Forgot password?
              </Link>
            </div>
          </div>
        )}
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-danger">{error}</p>}
        <Button type="submit" size="lg" className="w-full justify-center" disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === "magic" ? <Mail className="h-4 w-4" /> : <LogIn className="h-4 w-4" />}
          {mode === "magic" ? "Email me a sign-in link" : "Sign in"}
        </Button>
      </form>

      <div className="my-6 flex items-center gap-3 text-sm text-muted">
        <div className="h-px flex-1 bg-border" />
        Or continue with
        <div className="h-px flex-1 bg-border" />
      </div>
      <div className="space-y-3">
        <Button variant="outline" size="lg" className="w-full justify-center" onClick={() => setMode(mode === "magic" ? "password" : "magic")}>
          <Mail className="h-4 w-4" />
          {mode === "magic" ? "Sign in with password" : "Email me a magic link"}
        </Button>
        {googleEnabled && (
          <Button
            variant="outline"
            size="lg"
            className="w-full justify-center"
            onClick={() => authClient.signIn.social({ provider: "google", callbackURL: "/dashboard" })}
          >
            <GoogleIcon /> Continue with Google
          </Button>
        )}
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
