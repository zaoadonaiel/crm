import { redirect } from "next/navigation";
import { connection } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/schema";
import { SetupForm } from "@/components/auth/setup-form";

export const metadata = { title: "Setup" };

export default async function SetupPage() {
  await connection();
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(user);
  if (n > 0) redirect("/login");
  return <SetupForm />;
}
