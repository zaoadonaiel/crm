import { getMediaBucket, MEDIA_UNAVAILABLE_MESSAGE } from "@/lib/campaigns/r2";

/** Public, cacheable image serving for uploaded campaign media (emails link here). */
export async function GET(request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const { key: parts } = await params;
  const key = parts.map((p) => decodeURIComponent(p)).join("/");
  if (!key || key.includes("..")) return new Response("Not found", { status: 404 });

  const bucket = await getMediaBucket();
  if (!bucket) return new Response(MEDIA_UNAVAILABLE_MESSAGE, { status: 501 });

  const ifNoneMatch = request.headers.get("if-none-match");
  const object = await bucket.get(key);
  if (!object) return new Response("Not found", { status: 404 });

  const headers = new Headers({
    "Content-Type": object.httpMetadata?.contentType || "application/octet-stream",
    "Cache-Control": "public, max-age=31536000, immutable",
    ETag: object.httpEtag,
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
  });
  if (ifNoneMatch && ifNoneMatch === object.httpEtag) {
    return new Response(null, { status: 304, headers });
  }
  headers.set("Content-Length", String(object.size));
  return new Response(object.body, { headers });
}
