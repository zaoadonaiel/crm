"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { services } from "@/db/schema";
import { assertAdmin } from "@/lib/session";
import { parseMoneyToCents } from "@/lib/billing/format";

export type ServiceActionState = { error?: string; message?: string } | null;

const schema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  description: z.string().trim().max(2000).nullable(),
  price: z.number({ message: "Enter a valid price" }).int().min(0, "Enter a valid price"),
  interval: z.enum(["one_time", "month", "year"]),
  active: z.boolean(),
});

function parse(fd: FormData) {
  const desc = typeof fd.get("description") === "string" ? (fd.get("description") as string).trim() : "";
  const price = parseMoneyToCents(fd.get("price"));
  return schema.safeParse({
    name: fd.get("name") ?? "",
    description: desc || null,
    price: Number.isNaN(price) ? -1 : price,
    interval: fd.get("interval") ?? "month",
    active: fd.get("active") === "on",
  });
}

export async function saveServiceAction(id: string | null, _prev: ServiceActionState, fd: FormData): Promise<ServiceActionState> {
  await assertAdmin();
  const parsed = parse(fd);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  if (id) await db.update(services).set(parsed.data).where(eq(services.id, id));
  else await db.insert(services).values(parsed.data);
  revalidatePath("/services");
  return { message: id ? "Service updated" : "Service created" };
}

export async function toggleServiceActiveAction(id: string, active: boolean) {
  await assertAdmin();
  await db.update(services).set({ active }).where(eq(services.id, id));
  revalidatePath("/services");
}

export async function deleteServiceAction(id: string) {
  await assertAdmin();
  // Client services keep their own copy of name/price; the link is set null.
  await db.delete(services).where(eq(services.id, id));
  revalidatePath("/services");
}
