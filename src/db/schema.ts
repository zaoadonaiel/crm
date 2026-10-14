import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { nanoid } from "nanoid";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => nanoid());
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

/* ------------------------------------------------------------------ */
/* Auth (Better Auth)                                                  */
/* ------------------------------------------------------------------ */

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  /** "admin" = you / your team, "client" = portal user */
  role: text("role").notNull().default("client"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull().unique(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/* ------------------------------------------------------------------ */
/* CRM                                                                 */
/* ------------------------------------------------------------------ */

/** lead → prospect (proposal sent) → active (paying) → past */
export const CLIENT_STATUSES = ["lead", "prospect", "active", "past"] as const;
export type ClientStatus = (typeof CLIENT_STATUSES)[number];

export const clients = pgTable(
  "clients",
  {
    id: id(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    company: text("company"),
    phone: text("phone"),
    website: text("website"),
    status: text("status").$type<ClientStatus>().notNull().default("lead"),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    notes: text("notes"),
    /** linked portal login, once invited */
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    stripeCustomerId: text("stripe_customer_id"),
    lastContactedAt: timestamp("last_contacted_at", { withTimezone: true }),
    lastRepliedAt: timestamp("last_replied_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("clients_email_idx").on(t.email), index("clients_status_idx").on(t.status)],
);

/** Catalog of things you sell: web hosting, SEO retainer, maintenance… */
export const services = pgTable("services", {
  id: id(),
  name: text("name").notNull(),
  description: text("description"),
  /** cents */
  price: integer("price").notNull().default(0),
  currency: text("currency").notNull().default("usd"),
  interval: text("interval").$type<"one_time" | "month" | "year">().notNull().default("month"),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** A service delegated to a specific client (what they see in their portal). */
export const clientServices = pgTable(
  "client_services",
  {
    id: id(),
    clientId: text("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    serviceId: text("service_id").references(() => services.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    description: text("description"),
    status: text("status").$type<"active" | "pending" | "paused" | "cancelled">().notNull().default("active"),
    price: integer("price").notNull().default(0),
    currency: text("currency").notNull().default("usd"),
    interval: text("interval").$type<"one_time" | "month" | "year">().notNull().default("month"),
    startDate: timestamp("start_date", { withTimezone: true }).defaultNow(),
    renewalDate: timestamp("renewal_date", { withTimezone: true }),
    /** free-form details shown to the client, e.g. { Domain: "acme.com", Plan: "Pro" } */
    details: jsonb("details").$type<Record<string, string>>().notNull().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("client_services_client_idx").on(t.clientId)],
);

export const PROPOSAL_STATUSES = ["draft", "sent", "viewed", "accepted", "declined"] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

export const proposals = pgTable(
  "proposals",
  {
    id: id(),
    clientId: text("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    /** cents */
    amount: integer("amount").notNull().default(0),
    currency: text("currency").notNull().default("usd"),
    /** markdown/plain body shown on the public proposal page */
    body: text("body").notNull().default(""),
    status: text("status").$type<ProposalStatus>().notNull().default("draft"),
    /** public share token */
    token: text("token")
      .notNull()
      .$defaultFn(() => nanoid(24)),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    viewedAt: timestamp("viewed_at", { withTimezone: true }),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    /** auto-enroll in the "no response" follow-up sequence when sent */
    autoFollowUp: boolean("auto_follow_up").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("proposals_client_idx").on(t.clientId), uniqueIndex("proposals_token_idx").on(t.token)],
);

/** Mirror of Stripe invoices (Stripe is the source of truth, synced via webhook). */
export const invoices = pgTable(
  "invoices",
  {
    id: id(),
    clientId: text("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    stripeInvoiceId: text("stripe_invoice_id").unique(),
    number: text("number"),
    description: text("description"),
    /** cents */
    amountDue: integer("amount_due").notNull().default(0),
    amountPaid: integer("amount_paid").notNull().default(0),
    currency: text("currency").notNull().default("usd"),
    status: text("status")
      .$type<"draft" | "open" | "paid" | "void" | "uncollectible">()
      .notNull()
      .default("draft"),
    dueDate: timestamp("due_date", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    hostedUrl: text("hosted_url"),
    pdfUrl: text("pdf_url"),
    remindersEnabled: boolean("reminders_enabled").notNull().default(true),
    reminderCount: integer("reminder_count").notNull().default(0),
    lastReminderAt: timestamp("last_reminder_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("invoices_client_idx").on(t.clientId), index("invoices_status_idx").on(t.status)],
);

/* ------------------------------------------------------------------ */
/* Conversations (unified inbox)                                       */
/* ------------------------------------------------------------------ */

export const conversations = pgTable(
  "conversations",
  {
    id: id(),
    clientId: text("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    subject: text("subject").notNull().default(""),
    /** open | interested | closed */
    status: text("status").$type<"open" | "interested" | "closed">().notNull().default("open"),
    unread: boolean("unread").notNull().default(false),
    campaignId: text("campaign_id"),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull().defaultNow(),
    lastMessagePreview: text("last_message_preview"),
    lastMessageDirection: text("last_message_direction").$type<"in" | "out">(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("conversations_client_idx").on(t.clientId), index("conversations_last_idx").on(t.lastMessageAt)],
);

export const messages = pgTable(
  "messages",
  {
    id: id(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    direction: text("direction").$type<"in" | "out">().notNull(),
    /** email | portal | note */
    channel: text("channel").$type<"email" | "portal" | "note">().notNull().default("email"),
    fromEmail: text("from_email"),
    toEmail: text("to_email"),
    subject: text("subject"),
    bodyText: text("body_text").notNull().default(""),
    bodyHtml: text("body_html"),
    /** provider message id / RFC Message-ID for threading */
    providerId: text("provider_id"),
    sentByUserId: text("sent_by_user_id"),
    createdAt: createdAt(),
  },
  (t) => [index("messages_conversation_idx").on(t.conversationId)],
);

/* ------------------------------------------------------------------ */
/* Campaigns (newsletters, holiday blasts, announcements)              */
/* ------------------------------------------------------------------ */

export type EmailBlock =
  | { id: string; type: "logo"; src: string; width: number; align: "left" | "center" | "right"; href?: string }
  | { id: string; type: "heading"; text: string; level: 1 | 2 | 3; align: "left" | "center" | "right"; color?: string }
  | { id: string; type: "text"; text: string; align: "left" | "center" | "right"; color?: string; size?: number }
  | { id: string; type: "image"; src: string; alt: string; width: number; href?: string; align: "left" | "center" | "right"; rounded?: boolean }
  | { id: string; type: "button"; label: string; href: string; align: "left" | "center" | "right"; color?: string; textColor?: string }
  | { id: string; type: "divider"; color?: string }
  | { id: string; type: "spacer"; height: number }
  | { id: string; type: "columns"; left: string; right: string; leftImage?: string; rightImage?: string }
  | { id: string; type: "social"; links: { network: string; url: string }[]; align: "left" | "center" | "right" }
  | { id: string; type: "html"; html: string };

export type EmailTheme = {
  brandColor: string;
  backgroundColor: string;
  contentBackground: string;
  textColor: string;
  fontFamily: string;
  width: number;
};

export type Audience = {
  /** all | statuses | tags | clients | segment */
  mode: "all" | "statuses" | "tags" | "clients" | "segment";
  statuses?: ClientStatus[];
  tags?: string[];
  clientIds?: string[];
  segment?: "proposal_no_response" | "invoice_unpaid" | "no_contact_90d";
};

export const campaigns = pgTable("campaigns", {
  id: id(),
  name: text("name").notNull(),
  kind: text("kind").$type<"newsletter" | "announcement" | "holiday" | "outreach">().notNull().default("newsletter"),
  subject: text("subject").notNull().default(""),
  previewText: text("preview_text").notNull().default(""),
  fromName: text("from_name"),
  blocks: jsonb("blocks").$type<EmailBlock[]>().notNull().default([]),
  theme: jsonb("theme").$type<Partial<EmailTheme>>().notNull().default({}),
  audience: jsonb("audience").$type<Audience>().notNull().default({ mode: "all" }),
  /** draft | scheduled | sending | sent | failed */
  status: text("status").$type<"draft" | "scheduled" | "sending" | "sent" | "failed">().notNull().default("draft"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  /** create a conversation thread per recipient so replies land in the inbox */
  trackReplies: boolean("track_replies").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const campaignRecipients = pgTable(
  "campaign_recipients",
  {
    id: id(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    clientId: text("client_id").references(() => clients.id, { onDelete: "set null" }),
    email: text("email").notNull(),
    status: text("status")
      .$type<"queued" | "sent" | "delivered" | "opened" | "clicked" | "bounced" | "complained" | "failed" | "skipped">()
      .notNull()
      .default("queued"),
    providerId: text("provider_id"),
    conversationId: text("conversation_id"),
    error: text("error"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    openedAt: timestamp("opened_at", { withTimezone: true }),
    clickedAt: timestamp("clicked_at", { withTimezone: true }),
    repliedAt: timestamp("replied_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("campaign_recipients_campaign_idx").on(t.campaignId),
    index("campaign_recipients_provider_idx").on(t.providerId),
  ],
);

/* ------------------------------------------------------------------ */
/* Automations: follow-up sequences                                    */
/* ------------------------------------------------------------------ */

export type SequenceStep = {
  id: string;
  /** days to wait after the previous step (or after enrollment for step 0) */
  delayDays: number;
  subject: string;
  /** plain text with merge tags, sent as a personal-looking email */
  body: string;
};

export const SEQUENCE_TRIGGERS = ["proposal_sent", "invoice_sent", "manual"] as const;

export const sequences = pgTable("sequences", {
  id: id(),
  name: text("name").notNull(),
  trigger: text("trigger").$type<(typeof SEQUENCE_TRIGGERS)[number]>().notNull().default("manual"),
  steps: jsonb("steps").$type<SequenceStep[]>().notNull().default([]),
  /** stop the sequence as soon as the contact replies */
  stopOnReply: boolean("stop_on_reply").notNull().default(true),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const sequenceEnrollments = pgTable(
  "sequence_enrollments",
  {
    id: id(),
    sequenceId: text("sequence_id")
      .notNull()
      .references(() => sequences.id, { onDelete: "cascade" }),
    clientId: text("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    /** proposal id / invoice id that triggered it */
    refType: text("ref_type").$type<"proposal" | "invoice" | "manual">().notNull().default("manual"),
    refId: text("ref_id"),
    conversationId: text("conversation_id"),
    currentStep: integer("current_step").notNull().default(0),
    status: text("status").$type<"active" | "completed" | "stopped">().notNull().default("active"),
    stopReason: text("stop_reason"),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("enrollments_next_run_idx").on(t.status, t.nextRunAt),
    index("enrollments_client_idx").on(t.clientId),
  ],
);

/* ------------------------------------------------------------------ */
/* Deliverability + misc                                               */
/* ------------------------------------------------------------------ */

/** Anyone on this list never receives marketing email again. */
export const suppressions = pgTable("suppressions", {
  email: text("email").primaryKey(),
  reason: text("reason").$type<"unsubscribed" | "bounced" | "complained" | "manual">().notNull(),
  createdAt: createdAt(),
});

export const activities = pgTable(
  "activities",
  {
    id: id(),
    clientId: text("client_id").references(() => clients.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    summary: text("summary").notNull(),
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("activities_client_idx").on(t.clientId), index("activities_created_idx").on(t.createdAt)],
);

/** Singleton key/value settings (brand, sender identity, reminder cadence…). */
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: updatedAt(),
});

/** Uploaded media (campaign images, logos) stored in Cloudflare R2. */
export const media = pgTable("media", {
  id: id(),
  key: text("key").notNull().unique(),
  filename: text("filename").notNull(),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull().default(0),
  createdAt: createdAt(),
});

/* ------------------------------------------------------------------ */
/* Relations                                                           */
/* ------------------------------------------------------------------ */

export const clientsRelations = relations(clients, ({ many, one }) => ({
  services: many(clientServices),
  proposals: many(proposals),
  invoices: many(invoices),
  conversations: many(conversations),
  user: one(user, { fields: [clients.userId], references: [user.id] }),
}));
export const clientServicesRelations = relations(clientServices, ({ one }) => ({
  client: one(clients, { fields: [clientServices.clientId], references: [clients.id] }),
}));
export const proposalsRelations = relations(proposals, ({ one }) => ({
  client: one(clients, { fields: [proposals.clientId], references: [clients.id] }),
}));
export const invoicesRelations = relations(invoices, ({ one }) => ({
  client: one(clients, { fields: [invoices.clientId], references: [clients.id] }),
}));
export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  client: one(clients, { fields: [conversations.clientId], references: [clients.id] }),
  messages: many(messages),
}));
export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, { fields: [messages.conversationId], references: [conversations.id] }),
}));
export const campaignsRelations = relations(campaigns, ({ many }) => ({
  recipients: many(campaignRecipients),
}));
export const campaignRecipientsRelations = relations(campaignRecipients, ({ one }) => ({
  campaign: one(campaigns, { fields: [campaignRecipients.campaignId], references: [campaigns.id] }),
  client: one(clients, { fields: [campaignRecipients.clientId], references: [clients.id] }),
}));
export const sequenceEnrollmentsRelations = relations(sequenceEnrollments, ({ one }) => ({
  sequence: one(sequences, { fields: [sequenceEnrollments.sequenceId], references: [sequences.id] }),
  client: one(clients, { fields: [sequenceEnrollments.clientId], references: [clients.id] }),
}));
