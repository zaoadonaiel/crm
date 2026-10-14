"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { clients, invoices } from "@/db/schema";
import { assertAdmin } from "@/lib/session";
import { getStripe } from "@/lib/stripe";
import { createInvoice, refreshInvoiceFromStripe, sendInvoiceEmail, voidInvoice } from "@/lib/billing/stripe-sync";
import { sendInvoiceReminder } from "@/lib/billing/reminders";

export type InvoiceActionState = { error?: string; message?: string } | null;

const itemSchema = z.object({
  description: z.string().trim().min(1, "Each line item needs a description").max(500),
  amountCents: z.number().int().positive("Each line item needs an amount above $0"),
  quantity: z.number().int().min(1).max(10_000),
});

const createSchema = z.object({
  clientId: z.string().min(1, "Choose a client"),
  items: z.array(itemSchema).min(1, "Add at least one line item").max(100),
  daysUntilDue: z.number().int().min(0).max(365),
  memo: z.string().max(500).optional(),
  send: z.boolean(),
});

function errMsg(err: unknown) {
  if (err instanceof Error) return err.message;
  return "Something went wrong";
}

export async function createInvoiceAction(_prev: InvoiceActionState, fd: FormData): Promise<InvoiceActionState> {
  await assertAdmin();
  if (!getStripe()) return { error: "Connect Stripe first (add STRIPE_SECRET_KEY)." };
  let items: unknown;
  try {
    items = JSON.parse(String(fd.get("items") ?? "[]"));
  } catch {
    return { error: "Invalid line items" };
  }
  const parsed = createSchema.safeParse({
    clientId: String(fd.get("clientId") ?? ""),
    items,
    daysUntilDue: Number(fd.get("daysUntilDue") ?? 14),
    memo: String(fd.get("memo") ?? "").trim() || undefined,
    send: fd.get("send") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const client = await db.query.clients.findFirst({ where: eq(clients.id, parsed.data.clientId), columns: { id: true } });
  if (!client) return { error: "Client not found" };

  try {
    await createInvoice(parsed.data);
  } catch (err) {
    console.error("[invoices] create failed", err);
    return { error: errMsg(err) };
  }
  revalidatePath("/invoices");
  revalidatePath(`/clients/${parsed.data.clientId}`);
  redirect(`/invoices?created=1${parsed.data.send ? "&sent=1" : ""}`);
}

async function guard<T>(fn: () => Promise<T>, ok: string): Promise<InvoiceActionState> {
  await assertAdmin();
  try {
    await fn();
  } catch (err) {
    return { error: errMsg(err) };
  }
  revalidatePath("/invoices");
  return { message: ok };
}

export async function sendReminderNowAction(id: string) {
  return guard(() => sendInvoiceReminder(id, { manual: true }), "Reminder sent");
}

export async function resendInvoiceAction(id: string) {
  return guard(() => sendInvoiceEmail(id), "Invoice emailed");
}

export async function toggleRemindersAction(id: string, enabled: boolean) {
  return guard(
    () => db.update(invoices).set({ remindersEnabled: enabled }).where(eq(invoices.id, id)),
    enabled ? "Automatic reminders on" : "Automatic reminders off",
  );
}

export async function voidInvoiceAction(id: string) {
  return guard(() => voidInvoice(id), "Invoice voided");
}

export async function syncInvoiceAction(id: string) {
  return guard(() => refreshInvoiceFromStripe(id), "Synced with Stripe");
}
