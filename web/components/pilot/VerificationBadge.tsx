import Link from "next/link";
import { Pill, type PillTone } from "@/components/ui/Pill";
import { badgeText, STATE_LABEL, type ProfileState } from "@/lib/verification-state";

const TONE: Record<ProfileState, PillTone> = {
  VERIFIED: "ok",
  EXPIRING: "warn",
  CHECK_OVERDUE: "warn",
  MISMATCH: "err",
  UNVERIFIED: "neutral",
};

/** A profile's verification state and date, e.g. "Verified against SACAA records on 10 Nov 2026", linked to /verification. */
export function VerificationBadge({ state, lastPassAt, className = "" }: { state: ProfileState; lastPassAt: Date | null; className?: string }) {
  return (
    <span className={`inline-flex flex-wrap items-center gap-2 ${className}`}>
      <Pill tone={TONE[state]}>{STATE_LABEL[state]}</Pill>
      <Link href="/verification" className="text-sm text-slate-tac underline decoration-white/20 underline-offset-4 transition hover:text-ivory">
        {badgeText(state, lastPassAt)}
      </Link>
    </span>
  );
}
