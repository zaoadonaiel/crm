import { count } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/db";
import { sequences, type SequenceStep } from "@/db/schema";

const step = (delayDays: number, subject: string, body: string): SequenceStep => ({ id: nanoid(10), delayDays, subject, body });

/** Starter sequences — short, human, plain-text follow-ups that get replies. */
export function defaultSequences(): (typeof sequences.$inferInsert)[] {
  return [
    {
      name: "Proposal follow-up",
      trigger: "proposal_sent",
      stopOnReply: true,
      active: true,
      steps: [
        step(
          3,
          "Any questions on the proposal?",
          `Hi {{first_name}},

Just wanted to make sure the proposal made it to you okay. Happy to walk through any part of it, adjust the scope, or jump on a quick call if that's easier than email.

You can review it here: {{proposal_link}}

Anything I can clarify?`,
        ),
        step(
          4,
          "Quick check-in",
          `Hi {{first_name}},

I know things get busy, so I'm just floating this back to the top of your inbox. If the timing or budget isn't quite right, let me know — there's usually a way to phase the work so it fits.

Would it help to talk it over for 15 minutes this week?`,
        ),
        step(
          7,
          "Closing the loop",
          `Hi {{first_name}},

I haven't heard back, so I'll assume now isn't the right time and close this out on my end — no hard feelings at all.

If things change down the road, just reply to this email and we'll pick up right where we left off.

Thanks again for considering us!`,
        ),
      ],
    },
    {
      name: "Invoice nudge",
      trigger: "invoice_sent",
      stopOnReply: false,
      active: true,
      steps: [
        step(
          5,
          "Invoice {{invoice_number}} — friendly reminder",
          `Hi {{first_name}},

Just a friendly reminder that invoice {{invoice_number}} for {{invoice_amount}} is still open. You can view and pay it securely here:

{{invoice_link}}

If it's already on its way, please ignore this — and thank you!`,
        ),
        step(
          7,
          "Following up on invoice {{invoice_number}}",
          `Hi {{first_name}},

Following up on invoice {{invoice_number}} ({{invoice_amount}}), which is still showing as unpaid on our end.

Here's the payment link again: {{invoice_link}}

If there's an issue with the invoice or you need different payment terms, just reply and we'll sort it out.`,
        ),
      ],
    },
  ];
}

/** Insert the starter sequences, but only on a fresh install (no sequences yet). */
export async function ensureDefaultSequences() {
  const [row] = await db.select({ n: count() }).from(sequences);
  if ((row?.n ?? 0) > 0) return false;
  await db.insert(sequences).values(defaultSequences());
  return true;
}
