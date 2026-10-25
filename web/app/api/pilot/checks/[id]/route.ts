import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getPilotPersonId } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** DELETE — remove one of the signed-in pilot's own check records. */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const personId = await getPilotPersonId();
  if (!personId) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await params;
  // deleteMany scoped to the owner, so a pilot can only delete their own records.
  const res = await db.checkRecord.deleteMany({ where: { id, personId } });
  if (res.count === 0) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
