// A message on every verification state change (Task 5). The current state is derived (it can change with time:
// EXPIRING, CHECK_OVERDUE), so this compares it with the last state the pilot was told about (person.notifiedState):
//   * called right after a check is recorded (review decision, consent withdrawal, lookup), and
//   * daily from the cron, to catch changes that happen just because time passed.
// Idempotent: the change is CLAIMED with a conditional update (only if notifiedState is still the old value), so two
// overlapping calls can't both send. If nothing could be delivered the claim is rolled back and retried next run.
// The first time a pilot is seen, their state is recorded silently (no "you are unverified" message at sign-up).
import { db } from "./db";
import { sendStateChangeEmail } from "./email";
import { whatsappProvider, type WhatsAppProvider } from "./messaging";
import { PROFILE_STATE_SELECT, stateOf } from "./verification-checks";
import { badgeText, STATE_LABEL, type ProfileState } from "./verification-state";
import { sendStateChange } from "./whatsapp";

export type StateNoticeOutcome = "baseline" | "unchanged" | "sent" | "undelivered" | "raced";

export interface StateNoticeDeps {
  now?: Date;
  client?: typeof db;
  provider?: WhatsAppProvider;
  sendEmail?: typeof sendStateChangeEmail;
}

const SELECT = {
  id: true,
  fullName: true,
  email: true,
  whatsappE164: true,
  notifiedState: true,
  consents: { where: { scope: "whatsapp_notifications", revokedAt: null }, select: { id: true } },
  ...PROFILE_STATE_SELECT,
} as const;

export async function syncStateNotification(personId: string, deps: StateNoticeDeps = {}): Promise<StateNoticeOutcome> {
  const client = deps.client ?? db;
  const now = deps.now ?? new Date();
  const p = await client.person.findUnique({ where: { id: personId }, select: SELECT });
  if (!p) return "unchanged";
  const state: ProfileState = stateOf(p, now);
  const previous = p.notifiedState;
  if (previous === state) return "unchanged";

  // Claim the change: only one caller can move notifiedState from `previous` to `state`.
  const claimed = await client.person.updateMany({ where: { id: personId, notifiedState: previous }, data: { notifiedState: state, notifiedStateAt: now } });
  if (claimed.count === 0) return "raced";
  if (previous === null) return "baseline";

  const name = p.fullName.split(" ")[0] || p.fullName;
  const detail = badgeText(state, p.lastPassAt);
  let delivered = false;
  if (p.whatsappE164 && p.consents.length > 0) {
    delivered = (await sendStateChange({ toE164: p.whatsappE164, name, state: STATE_LABEL[state], detail }, deps.provider ?? whatsappProvider()).catch(() => false)) || delivered;
  }
  if (p.email) {
    delivered = (await (deps.sendEmail ?? sendStateChangeEmail)({ to: p.email, name, state: STATE_LABEL[state], detail }).catch(() => ({ ok: false }))).ok || delivered;
  }
  if (!delivered) {
    // Roll the claim back (only if nobody moved it since), so the next run tries again.
    await client.person.updateMany({ where: { id: personId, notifiedState: state }, data: { notifiedState: previous } });
    return "undelivered";
  }
  return "sent";
}

/** Daily sweep over every crew profile (catches EXPIRING / CHECK_OVERDUE changes that come with time). */
export async function runStateNotifications(deps: StateNoticeDeps = {}): Promise<Record<StateNoticeOutcome, number>> {
  const client = deps.client ?? db;
  const people = await client.person.findMany({ select: { id: true } });
  const tally: Record<StateNoticeOutcome, number> = { baseline: 0, unchanged: 0, sent: 0, undelivered: 0, raced: 0 };
  for (const p of people) tally[await syncStateNotification(p.id, deps)]++;
  return tally;
}
