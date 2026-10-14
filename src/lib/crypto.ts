const enc = new TextEncoder();

function secret() {
  return process.env.BETTER_AUTH_SECRET || "dev-secret-change-me";
}

function b64url(buf: ArrayBuffer | Uint8Array) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string) {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function hmac(data: string, key = secret()) {
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(data)));
}

/** Signed, URL-safe token carrying a small payload (e.g. an email for unsubscribe links). */
export async function signToken(payload: string) {
  const body = b64url(enc.encode(payload));
  const sig = b64url((await hmac(body)).slice(0, 16));
  return `${body}.${sig}`;
}

export async function verifyToken(token: string): Promise<string | null> {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = b64url((await hmac(body)).slice(0, 16));
  if (expected !== sig) return null;
  return new TextDecoder().decode(fromB64url(body));
}

export async function hmacHex(data: string, key: string) {
  return Array.from(await hmac(data, key), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hmacBase64(data: string, keyBytes: Uint8Array) {
  const k = await crypto.subtle.importKey("raw", keyBytes as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(data)));
  let s = "";
  for (const b of sig) s += String.fromCharCode(b);
  return btoa(s);
}

export function base64ToBytes(b64: string) {
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
