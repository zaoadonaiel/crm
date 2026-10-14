/**
 * Minimal typing for the Cloudflare R2 `MEDIA` binding, so we don't depend on
 * a generated cloudflare-env.d.ts.
 */
import { getCloudflareContext } from "@opennextjs/cloudflare";

export type R2ObjectLike = {
  key: string;
  size: number;
  httpEtag: string;
  uploaded: Date;
  httpMetadata?: { contentType?: string; cacheControl?: string };
};

export type R2ObjectBodyLike = R2ObjectLike & { body: ReadableStream };

export type R2BucketLike = {
  put(
    key: string,
    value: ArrayBuffer | ReadableStream | Uint8Array | string,
    options?: { httpMetadata?: { contentType?: string; cacheControl?: string }; customMetadata?: Record<string, string> },
  ): Promise<R2ObjectLike | null>;
  get(key: string): Promise<R2ObjectBodyLike | null>;
  delete(key: string | string[]): Promise<void>;
};

/** The MEDIA bucket, or null when running without the binding (e.g. plain `next dev`). */
export async function getMediaBucket(): Promise<R2BucketLike | null> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    const bucket = (env as unknown as { MEDIA?: R2BucketLike }).MEDIA;
    return bucket && typeof bucket.put === "function" ? bucket : null;
  } catch {
    return null;
  }
}

export const MEDIA_UNAVAILABLE_MESSAGE =
  "Image uploads need the Cloudflare R2 binding `MEDIA` (add an r2_buckets entry to wrangler config). You can paste an image URL instead.";
