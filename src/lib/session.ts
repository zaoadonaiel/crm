import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { getAuth } from "@/lib/auth";
import { db } from "@/db";
import { clients } from "@/db/schema";

export const getSession = cache(async () => {
  return getAuth().api.getSession({ headers: await headers() });
});

export async function requireAdmin() {
  const session = await getSession();
  if (!session) redirect("/login");
  if ((session.user as { role?: string }).role !== "admin") redirect("/portal");
  return session;
}

/** Use inside server actions: throws instead of redirecting. */
export async function assertAdmin() {
  const session = await getSession();
  if (!session || (session.user as { role?: string }).role !== "admin") throw new Error("Unauthorized");
  return session;
}

export async function requireClient() {
  const session = await getSession();
  if (!session) redirect("/login");
  if ((session.user as { role?: string }).role === "admin") redirect("/dashboard");
  const client = await db.query.clients.findFirst({ where: eq(clients.userId, session.user.id) });
  return { session, client };
}
