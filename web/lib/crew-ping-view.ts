import "server-only";
import { db } from "@/lib/db";
import { advanceCascade } from "@/lib/cascade";

/** What a pilot sees when they open a crew-request link. Shared by the page (first render) and the GET API (refresh). */
export interface PingView {
  status: "PENDING" | "ACCEPTED" | "DECLINED" | "EXPIRED" | "CANCELLED";
  secondsLeft: number;
  pilotName: string;
  operatorName: string;
  role: string;
  types: string[];
  departureIcao: string;
  startsAt: string;
  endsAt: string;
  hoursRequired: number;
  requestStatus: string;
}

/** Loads the ping for an unguessable token, or null if the token doesn't exist. Expires an overdue ping first. */
export async function loadPingView(token: string): Promise<PingView | null> {
  const ping = await db.crewPing.findUnique({
    where: { token },
    include: { crewRequest: { include: { operator: { select: { name: true } } } }, person: { select: { fullName: true } } },
  });
  if (!ping) return null;

  // Mark overdue pings as expired so the page never offers a button that cannot work.
  const expired = ping.status === "PENDING" && ping.expiresAt.getTime() <= Date.now();
  if (expired) await advanceCascade(ping.crewRequestId);
  const r = ping.crewRequest;
  return {
    status: expired ? "EXPIRED" : ping.status,
    secondsLeft: ping.status === "PENDING" && !expired ? Math.round((ping.expiresAt.getTime() - Date.now()) / 1000) : 0,
    pilotName: ping.person.fullName,
    operatorName: r.operator.name,
    role: r.role,
    types: r.requiredRatings,
    departureIcao: r.departureIcao,
    startsAt: r.startsAt.toISOString(),
    endsAt: r.endsAt.toISOString(),
    hoursRequired: r.hoursRequired,
    requestStatus: r.status,
  };
}
