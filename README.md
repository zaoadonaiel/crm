# Davey CRM

Clients, services, proposals, Stripe invoices, newsletters, follow-up automations and a unified inbox, plus a portal where your clients log in to see their services and pay invoices.

**Stack:** Next.js 16 · Neon Postgres + Drizzle · Better Auth · Resend (or Mailgun) · Stripe · Trigger.dev · Cloudflare Workers (OpenNext) + R2

---

## Run it locally (5 minutes, no accounts needed)

```bash
npm install
npm run db:local        # terminal 1 – local Postgres (PGlite) on :5433
npm run db:migrate      # terminal 2 – create tables
npm run db:seed         # optional demo data
npm run dev             # http://localhost:3000
```

The first visit sends you to **/setup** to create the owner (admin) account. Without API keys, emails are printed to the terminal, so you can test everything offline.

## Going live: step by step

### 1. Neon (database)
1. Create a project at neon.tech and copy the **pooled** connection string.
2. Put it in `.env` as `DATABASE_URL`, then run `npm run db:migrate`.

### 2. Resend (email) and replies into your inbox
1. Resend → Domains → add **`mail.yourdomain.com`** (a subdomain, see deliverability below). Add the DNS records it shows (SPF, DKIM, MX for bounces).
2. Create an API key → `RESEND_API_KEY`. Set `EMAIL_FROM=you@mail.yourdomain.com`.
3. **Receiving replies:** Resend → Domains → add **`reply.yourdomain.com`** with receiving enabled and add its MX record. Set `INBOUND_EMAIL_DOMAIN=reply.yourdomain.com`. Every email the CRM sends gets `Reply-To: reply+<conversation>@reply.yourdomain.com`, so replies thread into the right conversation automatically.
4. Resend → Webhooks → add `https://YOUR-APP/api/webhooks/resend` with events *email.received, delivered, opened, clicked, bounced, complained*. Copy the signing secret → `RESEND_WEBHOOK_SECRET`.

> Your Google Workspace mail on `yourdomain.com` is untouched: sending uses `mail.` and replies come in on `reply.`.

**Mailgun instead?** Set `EMAIL_PROVIDER=mailgun`, `MAILGUN_API_KEY`, `MAILGUN_DOMAIN`. Create a Route: *match_recipient("reply\\+.*@reply.yourdomain.com")* → forward to `https://YOUR-APP/api/webhooks/mailgun`, and point Mailgun event webhooks at the same URL (`MAILGUN_WEBHOOK_SIGNING_KEY`).

### 3. Stripe
1. `STRIPE_SECRET_KEY` (start with `sk_test_…`).
2. Developers → Webhooks → `https://YOUR-APP/api/webhooks/stripe`, events: `invoice.*`, `customer.deleted` → `STRIPE_WEBHOOK_SECRET`.
3. Settings → Billing → Customer portal: enable it (clients use it to manage cards).

### 4. Trigger.dev (background jobs)
Follow-up sequences, scheduled campaigns, large sends and daily invoice reminders run on Trigger.dev.
1. Create a project and set `TRIGGER_PROJECT_REF` and `TRIGGER_SECRET_KEY`.
2. In Trigger.dev → Environment variables, add the same `DATABASE_URL`, `RESEND_API_KEY`, `STRIPE_SECRET_KEY`, `EMAIL_FROM`, `INBOUND_EMAIL_DOMAIN`, `NEXT_PUBLIC_APP_URL`, `BETTER_AUTH_SECRET`.
3. `npm run trigger:deploy`

No Trigger.dev? Any scheduler can `POST /api/cron` with `Authorization: Bearer $CRON_SECRET`, or click **Settings → Run jobs now**.

### 5. Cloudflare (hosting)
Next.js on Cloudflare now runs on **Workers** via OpenNext. It's the same dashboard as Pages, but it replaces the deprecated `next-on-pages`.
```bash
npx wrangler login
npx wrangler r2 bucket create davey-crm-media      # campaign images & logos
# add each secret from .env (DATABASE_URL, BETTER_AUTH_SECRET, RESEND_API_KEY, STRIPE_*, …)
npx wrangler secret put DATABASE_URL
npm run deploy
```
Then add your custom domain (e.g. `crm.yourdomain.com`) in Workers → Settings → Domains and set `NEXT_PUBLIC_APP_URL`/`BETTER_AUTH_URL` to it.
The Workers **Paid plan ($5/mo)** is recommended: password hashing and campaign rendering can exceed the free plan's 10 ms CPU limit.

### 6. Google sign-in (optional)
Google Cloud Console → OAuth client → redirect URI `https://YOUR-APP/api/auth/callback/google` → `GOOGLE_CLIENT_ID/SECRET`.

---

## Keeping email out of spam

1. **Authenticate your domain:** SPF + DKIM (added by Resend/Mailgun) **and DMARC**. Add a TXT record `_dmarc.yourdomain.com` = `v=DMARC1; p=none; rua=mailto:you@yourdomain.com`, and move to `p=quarantine` after a few weeks. Gmail and Yahoo reject bulk mail without it.
2. **Send from a subdomain** (`mail.yourdomain.com`) so newsletter reputation can never hurt your Google Workspace mail.
3. **One-click unsubscribe:** built in. Every campaign includes `List-Unsubscribe` + `List-Unsubscribe-Post` headers and a footer link. Gmail requires this for bulk senders.
4. **Suppression list:** built in. Unsubscribes, hard bounces and spam complaints are never emailed again. Keep complaint rate < 0.1%.
5. **Warm up:** start with your warmest contacts (~50/day), then roughly double each week. Don't blast 2,000 cold contacts on day one.
6. **Content:** always include real text (image-only emails get flagged), fewer than 3–4 images, no URL shorteners, no ALL CAPS or "FREE!!!" subjects. The campaign editor warns you about these.
7. **Plain-text version:** generated automatically for every email.
8. **Personal follow-ups:** sequences are sent as simple, personal-looking emails (not templates), which land in Primary rather than Promotions.
9. **Physical address** in the footer (Settings → Mailing address). It's legally required.
10. Monitor with **Google Postmaster Tools** (free) once you send more than ~100/day to Gmail.

---

## Project map

| Path | What |
|---|---|
| `src/db/schema.ts` | All tables |
| `src/app/(admin)/*` | Admin app: dashboard, clients, inbox, campaigns, automations, proposals, invoices, services, settings |
| `src/app/portal/*` | Client portal |
| `src/app/p/[token]` | Public proposal page (accept/decline) |
| `src/app/u/[token]` | Unsubscribe page |
| `src/app/api/webhooks/*` | Resend, Mailgun, Stripe webhooks |
| `src/lib/conversations.ts` | Sending/receiving threaded email |
| `src/lib/campaigns/*` | Audience, rendering, sending |
| `src/lib/automations/*` | Follow-up sequences |
| `src/lib/billing/*` | Stripe sync and invoice reminders |
| `trigger/*` | Trigger.dev scheduled tasks |
