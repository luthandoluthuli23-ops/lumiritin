import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { CHECK_TYPE_CODES } from "@/lib/checks";
import { getPilotPersonId } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z
  .object({
    checkType: z.enum(CHECK_TYPE_CODES),
    aircraftType: z.string().trim().min(1).max(20).toUpperCase(),
    examiner: z.string().trim().min(1).max(120),
    completedAt: z.coerce.date(),
    expiresAt: z.coerce.date(),
  })
  .refine((v) => v.expiresAt > v.completedAt, { message: "Expiry must be after the completion date", path: ["expiresAt"] });

/** POST — add a recurrent check record for the signed-in pilot. */
export async function POST(req: NextRequest) {
  const personId = await getPilotPersonId();
  if (!personId) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_failed", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, { status: 422 });
  }

  const record = await db.checkRecord.create({ data: { personId, ...parsed.data } });
  return NextResponse.json({ ok: true, id: record.id }, { status: 201 });
}
