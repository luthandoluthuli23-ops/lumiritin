import type { PilotReputation, ReputationComponents, ReputationTier } from "@/lib/insights";
import { Pill, type PillTone } from "@/components/ui/Pill";

const TIER_STYLE: Record<ReputationTier, { tone: PillTone; ring: string }> = {
  Platinum: { tone: "gold", ring: "stroke-gold-light" },
  Gold: { tone: "gold", ring: "stroke-gold" },
  Silver: { tone: "neutral", ring: "stroke-ivory/70" },
  Bronze: { tone: "warn", ring: "stroke-warn" },
  Developing: { tone: "neutral", ring: "stroke-slate-tac" },
  New: { tone: "neutral", ring: "stroke-slate-tac" },
};

export function TierBadge({ tier }: { tier: ReputationTier }) {
  return <Pill tone={TIER_STYLE[tier].tone} className="shrink-0">{tier}</Pill>;
}

/** Circular reputation score. `size` is the diameter in px. */
export function ReputationRing({ score, tier, size = 96 }: { score: number; tier: ReputationTier; size?: number }) {
  const stroke = size < 72 ? 6 : 8;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (clamp(score) / 100) * circ;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0" role="img" aria-label={`Reputation score ${score} of 100, ${tier}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" className="stroke-white/10" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        className={TIER_STYLE[tier].ring}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${circ}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" className="fill-ivory font-display" fontSize={size * 0.3} fontWeight={600}>
        {score}
      </text>
    </svg>
  );
}

const BARS: { key: keyof ReputationComponents; label: string }[] = [
  { key: "reliability", label: "Reliability" },
  { key: "compliance", label: "Compliance" },
  { key: "experience", label: "Experience" },
];

export function ComponentBars({ components }: { components: ReputationComponents }) {
  return (
    <dl className="space-y-3">
      {BARS.map(({ key, label }) => (
        <div key={key}>
          <div className="flex justify-between text-xs text-slate-tac">
            <dt>{label}</dt>
            <dd className="text-ivory">{components[key]}</dd>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-gold" style={{ width: `${clamp(components[key])}%` }} />
          </div>
        </div>
      ))}
    </dl>
  );
}

/** Compact one-line reputation chip (ring + tier) for tables. */
export function ReputationMini({ reputation }: { reputation: PilotReputation }) {
  return (
    <span className="inline-flex items-center gap-2">
      <ReputationRing score={reputation.score} tier={reputation.tier} size={40} />
      <TierBadge tier={reputation.tier} />
    </span>
  );
}

const clamp = (n: number) => Math.max(0, Math.min(100, n));
