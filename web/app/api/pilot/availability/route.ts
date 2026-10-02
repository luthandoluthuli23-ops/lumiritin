import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { currentState, describeState, validateAvailableWindow } from "@/lib/availability";
import { getPilotPersonId } from "@/lib/session";

const schema = z.discriminatedUnion("mode", [
  /** `until` is the expiry. It must be in the future and at most 7 days away. */
  z.object({ mode: z.literal("available"), until: z.coerce.date() }),
  z.object({ mode: z.literal("off") }),
]);

async function stateFor(personId: string) {
  const windows = await db.availability.findMany({ where: { personId, endsAt: { gt: new Date(Date.now() - 86_400_000) } } });
  const state = currentState(windows);
  return { state: state.state, until: state.until, label: describeState(state), reason: state.reason };
}

/** GET /api/pilot/availability — the signed-in pilot's current state. */
export async function GET() {
  const personId = await getPilotPersonId();
  if (!personId) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json(await stateFor(personId));
}

/**
 * POST /api/pilot/availability
 *   { mode: "available", until: ISO }  go AVAILABLE until that time (replaces any earlier manual availability: this is the renewal)
 *   { mode: "off" }                    go OFF now
 * Booked windows (accepted jobs, operator-marked flights, external calendar) are never changed here.
 */
export async function POST(req: NextRequest) {
  const personId = await getPilotPersonId();
  if (!personId) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "validation_failed", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, { status: 422 });
  const input = parsed.data;
  const now = new Date();

  if (input.mode === "available") {
    const problem = validateAvailableWindow(now, input.until, now);
    if (problem) return NextResponse.json({ error: "validation_failed", issues: [{ path: "until", message: problem }] }, { status: 422 });
    await db.$transaction([
      db.availability.deleteMany({ where: { personId, source: "MANUAL", state: "AVAILABLE" } }),
      db.availability.create({ data: { personId, state: "AVAILABLE", source: "MANUAL", startsAt: now, endsAt: input.until } }),
    ]);
  } else {
    await db.availability.deleteMany({ where: { personId, source: "MANUAL", state: "AVAILABLE" } });
  }
  return NextResponse.json(await stateFor(personId));
}
