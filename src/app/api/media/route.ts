import { nanoid } from "nanoid";
import { db } from "@/db";
import { media } from "@/db/schema";
import { getMediaBucket, MEDIA_UNAVAILABLE_MESSAGE } from "@/lib/campaigns/r2";
import { getSession } from "@/lib/session";
import { appUrl } from "@/lib/utils";

const MAX_BYTES = 5 * 1024 * 1024;
// SVG is intentionally excluded: most email clients don't render it and it can carry scripts.
const TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

function error(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || (session.user as { role?: string }).role !== "admin") return error("Unauthorized", 401);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return error("Expected multipart/form-data", 400);
  }
  const file = form.get("file");
  if (!(file instanceof File)) return error("No file uploaded (field name: file)", 400);
  const ext = TYPES[file.type];
  if (!ext) return error("Only PNG, JPEG, GIF or WebP images are allowed", 415);
  if (file.size > MAX_BYTES) return error("Image must be 5 MB or smaller", 413);
  if (file.size === 0) return error("The file is empty", 400);

  const bucket = await getMediaBucket();
  if (!bucket) return error(MEDIA_UNAVAILABLE_MESSAGE, 501);

  const now = new Date();
  const key = `uploads/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${nanoid(16)}.${ext}`;
  const filename = (file.name || `image.${ext}`).slice(0, 200);

  try {
    await bucket.put(key, await file.arrayBuffer(), {
      httpMetadata: { contentType: file.type, cacheControl: "public, max-age=31536000, immutable" },
      customMetadata: { filename },
    });
  } catch (e) {
    console.error("[media] R2 upload failed", e);
    return error("Upload failed — please try again", 502);
  }

  const [row] = await db
    .insert(media)
    .values({ key, filename, contentType: file.type, size: file.size })
    .returning();

  return Response.json({ id: row?.id, key, url: appUrl(`/media/${key}`) }, { status: 201 });
}
