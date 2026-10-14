import { CreditCard, ExternalLink } from "lucide-react";
import { Card } from "@/components/ui";

/** Friendly setup card shown wherever billing needs Stripe but it isn't configured. */
export function ConnectStripeNotice({ compact }: { compact?: boolean }) {
  return (
    <Card className={compact ? "p-4" : "p-6"}>
      <div className="flex items-start gap-4">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#635bff]/10 text-[#635bff]">
          <CreditCard className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="font-semibold">Connect Stripe to send invoices</p>
          <p className="mt-1 text-sm text-muted">
            Add <code className="rounded bg-black/5 px-1 text-[12px]">STRIPE_SECRET_KEY</code> and{" "}
            <code className="rounded bg-black/5 px-1 text-[12px]">STRIPE_WEBHOOK_SECRET</code> to your environment, then point a Stripe webhook at{" "}
            <code className="rounded bg-black/5 px-1 text-[12px]">/api/webhooks/stripe</code> with the <em>invoice.*</em> and <em>customer.deleted</em> events.
          </p>
          <a
            href="https://dashboard.stripe.com/apikeys"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline"
          >
            Get your API keys <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </Card>
  );
}
