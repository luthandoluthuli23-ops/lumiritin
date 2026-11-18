import { after, NextResponse, type NextRequest } from "next/server";
import { syncStateNotification } from "@/lib/state-notifications";
import { z } from "zod";
import { COMPARED_FIELDS, decideSubmission } from "@/lib/pilot-verification";
import { getReviewer } from "@/lib/reviewers";

export const dynamic = "force-dynamic";

const schema = z.object({
  decision: z.enum(["VERIFIED", "MISMATCH", "UNREADABLE"]),
  matches: z.object(Object.fromEntries(COMPARED_FIELDS.map((f) => [f, z.boolean()])) as Record<(typeof COMPARED_FIELDS)[number], z.ZodBoolean>),
  note: z.string().trim().max(500).optional(),
});

/** POST — a reviewer decides a submission. VERIFIED only counts if every field was confirmed to match. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const reviewer = await getReviewer();
  if (!reviewer) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "validation_failed" }, { status: 422 });

  const r = await decideSubmission((await params).id, reviewer, parsed.data.decision, parsed.data.matches, parsed.data.note || null);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.error === "not_found" ? 404 : r.error === "own_submission" ? 403 : 409 });
  // Tell the pilot if their state changed (after the response; idempotent, so a later daily run won't repeat it).
  after(() => syncStateNotification(r.personId).catch((e) => console.error("[review] state message failed:", e)));
  return NextResponse.json({ ok: true, result: r.result });
}
