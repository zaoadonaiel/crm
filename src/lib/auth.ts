import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { APIError } from "better-auth/api";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { sendEmail } from "@/lib/email/send";
import { noticeEmailHtml } from "@/lib/email/transactional";
import { appUrl } from "@/lib/utils";

function adminEmails() {
  return (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

function createAuth() {
  return betterAuth({
    baseURL: appUrl(),
    secret: process.env.BETTER_AUTH_SECRET,
    // Extra origins allowed to sign in, e.g. the workers.dev URL alongside your custom domain.
    trustedOrigins: (process.env.TRUSTED_ORIGINS || "")
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean),
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: { user: schema.user, session: schema.session, account: schema.account, verification: schema.verification },
    }),
    user: {
      additionalFields: {
        role: { type: "string", required: false, defaultValue: "client", input: false },
      },
    },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      sendResetPassword: async ({ user, url }) => {
        await sendEmail({
          to: user.email,
          subject: "Reset your password",
          html: await noticeEmailHtml({
            heading: "Reset your password",
            bodyText: `Hi ${user.name.split(" ")[0]},\n\nClick below to choose a new password. This link expires in 1 hour.`,
            cta: { label: "Reset password", url },
            footnote: "If you didn't request this, you can ignore this email.",
          }),
        });
      },
    },
    socialProviders:
      process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
        ? { google: { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET } }
        : undefined,
    plugins: [
      magicLink({
        expiresIn: 60 * 60 * 24, // 24h so portal invites don't expire before clients open them
        sendMagicLink: async ({ email, url }) => {
          await sendEmail({
            to: email,
            subject: "Your sign-in link",
            html: await noticeEmailHtml({
              heading: "Sign in to your portal",
              bodyText: "Click the button below to sign in. This link expires in 24 hours and can be used once.",
              cta: { label: "Sign in", url },
              footnote: "If you didn't request this, you can ignore this email.",
            }),
          });
        },
      }),
      nextCookies(),
    ],
    databaseHooks: {
      user: {
        create: {
          /**
           * Accounts are invite-only:
           *  - emails in ADMIN_EMAILS (or the very first account) become admins
           *  - anyone else must already exist as a client you've added
           */
          before: async (u) => {
            const email = u.email.toLowerCase();
            const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(schema.user);
            if (adminEmails().includes(email) || count === 0) {
              return { data: { ...u, email, role: "admin" } };
            }
            const client = await db.query.clients.findFirst({ where: eq(schema.clients.email, email) });
            if (!client) {
              throw new APIError("FORBIDDEN", {
                message: "No account found for this email. Ask us for an invite.",
              });
            }
            return { data: { ...u, email, role: "client" } };
          },
          after: async (u) => {
            await db
              .update(schema.clients)
              .set({ userId: u.id })
              .where(eq(schema.clients.email, u.email.toLowerCase()));
          },
        },
      },
    },
  });
}

type Auth = ReturnType<typeof createAuth>;
let _auth: Auth | undefined;

/** Created lazily so env vars are read at request time (Cloudflare Workers). */
export function getAuth(): Auth {
  _auth ??= createAuth();
  return _auth;
}

export type Session = Auth["$Infer"]["Session"];
