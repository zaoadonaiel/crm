import Stripe from "stripe";

let _stripe: Stripe | null | undefined;

/** Returns null when STRIPE_SECRET_KEY isn't configured (billing features show a setup notice). */
export function getStripe(): Stripe | null {
  if (_stripe !== undefined) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  _stripe = key ? new Stripe(key, { httpClient: Stripe.createFetchHttpClient() }) : null;
  return _stripe;
}

export function requireStripe(): Stripe {
  const s = getStripe();
  if (!s) throw new Error("Stripe is not configured. Add STRIPE_SECRET_KEY to your environment.");
  return s;
}
