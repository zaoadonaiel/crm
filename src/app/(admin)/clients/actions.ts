"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { CLIENT_STATUSES, clientServices, clients, proposals, type ClientStatus } from "@/db/schema";
import { assertAdmin } from "@/lib/session";
import { getAuth } from "@/lib/auth";
import { getOrCreateConversation, logActivity } from "@/lib/conversations";
import { parseMoneyToCents } from "@/lib/billing/format";

export type ActionState = { error?: string; message?: string; id?: string } | null;

const INTERVAL = z.enum(["one_time", "month", "year"]);
const SERVICE_STATUS = z.enum(["active", "pending", "paused", "cancelled"]);

function str(v: FormDataEntryValue | null) {
  const s = typeof v === "string" ? v.trim() : "";
  return s || null;
}

function normalizeTags(input: string | string[] | null | undefined): string[] {
  const arr = Array.isArray(input) ? input : (input ?? "").split(/[,;|]/);
  const out: string[] = [];
  for (const t of arr) {
    const tag = t.trim().toLowerCase().replace(/\s+/g, "-").slice(0, 40);
    if (tag && !out.includes(tag)) out.push(tag);
  }
  return out;
}

function normalizeWebsite(v: string | null) {
  if (!v) return null;
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

const clientSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  company: z.string().trim().max(200).nullable(),
  phone: z.string().trim().max(60).nullable(),
  website: z.string().trim().max(300).nullable(),
  status: z.enum(CLIENT_STATUSES),
  notes: z.string().max(10_000).nullable(),
});

function parseClient(fd: FormData) {
  return clientSchema.safeParse({
    name: fd.get("name") ?? "",
    email: fd.get("email") ?? "",
    company: str(fd.get("company")),
    phone: str(fd.get("phone")),
    website: normalizeWebsite(str(fd.get("website"))),
    status: (str(fd.get("status")) ?? "lead") as ClientStatus,
    notes: typeof fd.get("notes") === "string" ? (fd.get("notes") as string) || null : null,
  });
}

async function emailTaken(email: string, exceptId?: string) {
  const found = await db.query.clients.findFirst({ where: eq(clients.email, email), columns: { id: true } });
  return !!found && found.id !== exceptId;
}

/* ------------------------------------------------------------------ */
/* Create / update / delete                                            */
/* ------------------------------------------------------------------ */

export async function createClientAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await assertAdmin();
  const parsed = parseClient(fd);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  if (await emailTaken(parsed.data.email)) return { error: "A client with this email already exists." };
  const tags = normalizeTags(str(fd.get("tags")));
  const [c] = await db
    .insert(clients)
    .values({ ...parsed.data, tags })
    .returning({ id: clients.id });
  await logActivity(c!.id, "client.created", "Client added");
  revalidatePath("/clients");
  redirect(`/clients/${c!.id}`);
}

export async function updateClientAction(id: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  await assertAdmin();
  const parsed = parseClient(fd);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  if (await emailTaken(parsed.data.email, id)) return { error: "Another client already uses this email." };
  const before = await db.query.clients.findFirst({ where: eq(clients.id, id) });
  if (!before) return { error: "Client not found" };
  const tags = normalizeTags(str(fd.get("tags")));
  await db
    .update(clients)
    .set({ ...parsed.data, tags })
    .where(eq(clients.id, id));
  if (before.status !== parsed.data.status) {
    await logActivity(id, "client.status", `Status changed from ${before.status} to ${parsed.data.status}`);
  }
  if (before.email !== parsed.data.email && before.userId) {
    await logActivity(id, "client.email", `Email changed to ${parsed.data.email} (portal login still uses ${before.email})`);
  }
  revalidatePath(`/clients/${id}`);
  revalidatePath("/clients");
  return { message: "Saved" };
}

export async function deleteClientAction(id: string) {
  await assertAdmin();
  await db.delete(clients).where(eq(clients.id, id));
  revalidatePath("/clients");
  redirect("/clients");
}

/* ------------------------------------------------------------------ */
/* Bulk actions                                                        */
/* ------------------------------------------------------------------ */

const idsSchema = z.array(z.string().min(1)).min(1).max(1000);

export async function bulkSetStatusAction(ids: string[], status: ClientStatus): Promise<ActionState> {
  await assertAdmin();
  const parsedIds = idsSchema.safeParse(ids);
  if (!parsedIds.success || !CLIENT_STATUSES.includes(status)) return { error: "Nothing selected" };
  await db.update(clients).set({ status }).where(inArray(clients.id, parsedIds.data));
  revalidatePath("/clients");
  return { message: `Updated ${parsedIds.data.length} client${parsedIds.data.length === 1 ? "" : "s"}` };
}

export async function bulkAddTagAction(ids: string[], tag: string): Promise<ActionState> {
  await assertAdmin();
  const parsedIds = idsSchema.safeParse(ids);
  const [t] = normalizeTags(tag);
  if (!parsedIds.success || !t) return { error: "Choose clients and a tag" };
  await db
    .update(clients)
    .set({ tags: sql`case when ${clients.tags} @> ${JSON.stringify([t])}::jsonb then ${clients.tags} else ${clients.tags} || ${JSON.stringify([t])}::jsonb end` })
    .where(inArray(clients.id, parsedIds.data));
  revalidatePath("/clients");
  return { message: `Tagged ${parsedIds.data.length} client${parsedIds.data.length === 1 ? "" : "s"} “${t}”` };
}

export async function bulkRemoveTagAction(ids: string[], tag: string): Promise<ActionState> {
  await assertAdmin();
  const parsedIds = idsSchema.safeParse(ids);
  const [t] = normalizeTags(tag);
  if (!parsedIds.success || !t) return { error: "Choose clients and a tag" };
  await db
    .update(clients)
    .set({ tags: sql`${clients.tags} - ${t}::text` })
    .where(inArray(clients.id, parsedIds.data));
  revalidatePath("/clients");
  return { message: `Removed “${t}”` };
}

export async function bulkDeleteAction(ids: string[]): Promise<ActionState> {
  await assertAdmin();
  const parsedIds = idsSchema.safeParse(ids);
  if (!parsedIds.success) return { error: "Nothing selected" };
  await db.delete(clients).where(inArray(clients.id, parsedIds.data));
  revalidatePath("/clients");
  return { message: `Deleted ${parsedIds.data.length} client${parsedIds.data.length === 1 ? "" : "s"}` };
}

/* ------------------------------------------------------------------ */
/* CSV import                                                          */
/* ------------------------------------------------------------------ */

/** RFC-4180-ish CSV parser (quotes, escaped quotes, CRLF, embedded newlines). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (q) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          cell += '"';
          i++;
        } else q = false;
      } else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === "," || ch === "\t") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const HEADER_ALIASES: Record<string, "name" | "email" | "company" | "phone" | "tags" | "website" | "status"> = {
  name: "name",
  "full name": "name",
  fullname: "name",
  contact: "name",
  email: "email",
  "email address": "email",
  "e-mail": "email",
  company: "company",
  organization: "company",
  organisation: "company",
  business: "company",
  phone: "phone",
  "phone number": "phone",
  mobile: "phone",
  tags: "tags",
  tag: "tags",
  labels: "tags",
  website: "website",
  url: "website",
  status: "status",
};

export async function importClientsAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await assertAdmin();
  let text = typeof fd.get("csv") === "string" ? (fd.get("csv") as string) : "";
  const file = fd.get("file");
  if (file && typeof file === "object" && "text" in file && file.size > 0) {
    if (file.size > 5_000_000) return { error: "File is too large (max 5 MB)." };
    text = await file.text();
  }
  if (!text.trim()) return { error: "Paste CSV text or choose a file." };

  const rows = parseCsv(text);
  if (!rows.length) return { error: "No rows found." };

  // Header detection: use it if any header cell looks like "email".
  let cols: (string | undefined)[] = ["name", "email", "company", "phone", "tags"];
  const first = rows[0]!.map((c) => c.trim().toLowerCase());
  if (first.some((c) => HEADER_ALIASES[c] === "email")) {
    cols = first.map((c) => HEADER_ALIASES[c]);
    rows.shift();
  }

  const seen = new Set<string>();
  const candidates: (typeof clients.$inferInsert)[] = [];
  let invalid = 0;
  for (const r of rows) {
    const rec: Record<string, string> = {};
    cols.forEach((key, i) => {
      if (key && r[i] !== undefined) rec[key] = r[i]!.trim();
    });
    const email = (rec.email ?? "").toLowerCase();
    if (!z.string().email().safeParse(email).success) {
      invalid++;
      continue;
    }
    if (seen.has(email)) continue;
    seen.add(email);
    const status = CLIENT_STATUSES.includes((rec.status ?? "").toLowerCase() as ClientStatus)
      ? ((rec.status ?? "").toLowerCase() as ClientStatus)
      : "lead";
    candidates.push({
      name: (rec.name || email.split("@")[0]!).slice(0, 200),
      email,
      company: rec.company || null,
      phone: rec.phone || null,
      website: normalizeWebsite(rec.website || null),
      status,
      tags: normalizeTags(rec.tags),
    });
  }
  if (!candidates.length) return { error: invalid ? `No valid emails found (${invalid} invalid rows).` : "No rows to import." };

  let created = 0;
  for (let i = 0; i < candidates.length; i += 200) {
    const chunk = candidates.slice(i, i + 200);
    const inserted = await db.insert(clients).values(chunk).onConflictDoNothing({ target: clients.email }).returning({ id: clients.id });
    created += inserted.length;
  }
  const skipped = candidates.length - created;
  if (created) await logActivity(null, "clients.imported", `Imported ${created} client${created === 1 ? "" : "s"} from CSV`);
  revalidatePath("/clients");
  const parts = [`Imported ${created} new client${created === 1 ? "" : "s"}`];
  if (skipped) parts.push(`${skipped} already existed`);
  if (invalid) parts.push(`${invalid} invalid row${invalid === 1 ? "" : "s"} skipped`);
  return { message: parts.join(" · ") };
}

/* ------------------------------------------------------------------ */
/* Services assigned to a client                                       */
/* ------------------------------------------------------------------ */

function parseDetails(raw: FormDataEntryValue | null): Record<string, string> {
  if (typeof raw !== "string" || !raw) return {};
  try {
    const arr = JSON.parse(raw) as unknown;
    const out: Record<string, string> = {};
    if (Array.isArray(arr)) {
      for (const pair of arr) {
        if (Array.isArray(pair) && typeof pair[0] === "string" && typeof pair[1] === "string") {
          const k = pair[0].trim().slice(0, 60);
          if (k) out[k] = pair[1].trim().slice(0, 500);
        }
      }
    }
    return out;
  } catch {
    return {};
  }
}

function parseDate(v: FormDataEntryValue | null) {
  const s = str(v);
  if (!s) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

const clientServiceSchema = z.object({
  name: z.string().trim().min(1, "Service name is required").max(200),
  description: z.string().trim().max(2000).nullable(),
  status: SERVICE_STATUS,
  interval: INTERVAL,
  price: z.number().int().min(0, "Price must be a positive amount"),
});

function parseClientService(fd: FormData) {
  return clientServiceSchema.safeParse({
    name: fd.get("name") ?? "",
    description: str(fd.get("description")),
    status: str(fd.get("status")) ?? "active",
    interval: str(fd.get("interval")) ?? "month",
    price: parseMoneyToCents(fd.get("price")),
  });
}

export async function addClientServiceAction(clientId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  await assertAdmin();
  const parsed = parseClientService(fd);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const serviceId = str(fd.get("serviceId"));
  await db.insert(clientServices).values({
    clientId,
    serviceId,
    ...parsed.data,
    startDate: parseDate(fd.get("startDate")) ?? new Date(),
    renewalDate: parseDate(fd.get("renewalDate")),
    details: parseDetails(fd.get("details")),
  });
  await logActivity(clientId, "service.added", `Added service “${parsed.data.name}”`);
  revalidatePath(`/clients/${clientId}`);
  return { message: "Service added" };
}

export async function updateClientServiceAction(id: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  await assertAdmin();
  const parsed = parseClientService(fd);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const before = await db.query.clientServices.findFirst({ where: eq(clientServices.id, id) });
  if (!before) return { error: "Service not found" };
  await db
    .update(clientServices)
    .set({
      ...parsed.data,
      startDate: parseDate(fd.get("startDate")) ?? before.startDate,
      renewalDate: parseDate(fd.get("renewalDate")),
      details: parseDetails(fd.get("details")),
    })
    .where(eq(clientServices.id, id));
  if (before.status !== parsed.data.status) {
    await logActivity(before.clientId, "service.status", `“${parsed.data.name}” is now ${parsed.data.status}`);
  }
  revalidatePath(`/clients/${before.clientId}`);
  return { message: "Saved" };
}

export async function deleteClientServiceAction(id: string) {
  await assertAdmin();
  const [row] = await db.delete(clientServices).where(eq(clientServices.id, id)).returning();
  if (row) {
    await logActivity(row.clientId, "service.removed", `Removed service “${row.name}”`);
    revalidatePath(`/clients/${row.clientId}`);
  }
}

/* ------------------------------------------------------------------ */
/* Portal, conversations, proposals                                    */
/* ------------------------------------------------------------------ */

export async function inviteToPortalAction(clientId: string): Promise<ActionState> {
  await assertAdmin();
  const client = await db.query.clients.findFirst({ where: eq(clients.id, clientId) });
  if (!client) return { error: "Client not found" };
  try {
    await getAuth().api.signInMagicLink({
      body: { email: client.email.toLowerCase(), callbackURL: "/portal" },
      headers: await headers(),
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not send the invite" };
  }
  await logActivity(clientId, "portal.invited", `Sent portal sign-in link to ${client.email}`);
  revalidatePath(`/clients/${clientId}`);
  return { message: `Sign-in link sent to ${client.email}` };
}

export async function startConversationAction(clientId: string) {
  await assertAdmin();
  const client = await db.query.clients.findFirst({ where: eq(clients.id, clientId), columns: { id: true } });
  if (!client) throw new Error("Client not found");
  const convo = await getOrCreateConversation(clientId, "");
  redirect(`/inbox?c=${convo.id}`);
}

export async function createProposalForClientAction(clientId: string) {
  await assertAdmin();
  const client = await db.query.clients.findFirst({ where: eq(clients.id, clientId), columns: { id: true, company: true, name: true } });
  if (!client) throw new Error("Client not found");
  const [p] = await db
    .insert(proposals)
    .values({ clientId, title: `Proposal for ${client.company || client.name}` })
    .returning({ id: proposals.id });
  redirect(`/proposals/${p!.id}`);
}
