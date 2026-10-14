import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/schema";
import { getSession } from "@/lib/session";
import { LoginForm } from "@/components/auth/login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect((session.user as { role?: string }).role === "admin" ? "/dashboard" : "/portal");
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(user);
  if (n === 0) redirect("/setup");
  return <LoginForm googleEnabled={!!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)} />;
}
