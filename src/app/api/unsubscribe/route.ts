import { emailFromToken, unsubscribeEmail } from "@/lib/campaigns/unsubscribe";

async function tokenFrom(request: Request) {
  const url = new URL(request.url);
  let token = url.searchParams.get("t");
  if (!token) {
    const type = request.headers.get("content-type") ?? "";
    if (type.includes("application/x-www-form-urlencoded") || type.includes("multipart/form-data")) {
      const form = await request.formData().catch(() => null);
      const t = form?.get("t");
      if (typeof t === "string") token = t;
    }
  }
  return token;
}

/**
 * RFC 8058 one-click unsubscribe. Mail providers (Gmail, Yahoo, Apple) POST
 * `List-Unsubscribe=One-Click` to the URL in the List-Unsubscribe header.
 */
export async function POST(request: Request) {
  const token = await tokenFrom(request);
  const email = token ? await emailFromToken(token) : null;
  if (!email) return new Response("Invalid or expired unsubscribe link", { status: 400 });
  await unsubscribeEmail(email, "one-click");
  return new Response("You have been unsubscribed.", { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

/** Humans who open the header URL in a browser get the friendly confirm page. */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("t");
  if (!token) return new Response("Missing token", { status: 400 });
  return Response.redirect(new URL(`/u/${encodeURIComponent(token)}`, request.url), 303);
}
