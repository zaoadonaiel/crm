import { runJobs, jobs, type JobName } from "@/lib/jobs";
import { timingSafeEqual } from "@/lib/crypto";

/**
 * POST /api/cron?job=followups   (or no param = run everything)
 * Authorization: Bearer $CRON_SECRET
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !timingSafeEqual(auth, `Bearer ${secret}`)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const job = new URL(req.url).searchParams.get("job");
  const names = job ? (job.split(",").filter((j) => j in jobs) as JobName[]) : undefined;
  return Response.json({ ok: true, results: await runJobs(names) });
}
