// Specialised crew competencies. Pilots carry SACAA Part 61 ratings/endorsements and operational
// competencies; cabin crew (flight attendants) carry Part 64 / SA-CATS 64 training currencies.
// Stored as codes on Person.competencies; which set applies is chosen by the person's crew role.
export type CrewKind = "PILOT" | "CABIN_CREW";

export interface Competency {
  code: string;
  label: string;
  group: string;
  roles: CrewKind[];
}

export const COMPETENCIES: readonly Competency[] = [
  // ── Pilot ──
  { code: "NIGHT", label: "Night rating", group: "Core ratings", roles: ["PILOT"] },
  { code: "IF", label: "Instrument (IFR)", group: "Core ratings", roles: ["PILOT"] },
  { code: "NVG", label: "Night vision goggles (NVG)", group: "Core ratings", roles: ["PILOT"] },
  { code: "SLING", label: "Sling / external load (HESLO)", group: "Specialised operations", roles: ["PILOT"] },
  { code: "LONGLINE", label: "Long-line", group: "Specialised operations", roles: ["PILOT"] },
  { code: "WINCH", label: "Winch / hoist", group: "Specialised operations", roles: ["PILOT"] },
  { code: "FIREFIGHT", label: "Firefighting (bucket / tank)", group: "Specialised operations", roles: ["PILOT"] },
  { code: "HEMS", label: "HEMS / air ambulance", group: "Specialised operations", roles: ["PILOT"] },
  { code: "SURVEY", label: "Aerial survey / powerline", group: "Specialised operations", roles: ["PILOT"] },
  { code: "MOUNTAIN", label: "Mountain flying", group: "Environment", roles: ["PILOT"] },
  { code: "OFFSHORE", label: "Offshore", group: "Environment", roles: ["PILOT", "CABIN_CREW"] },
  { code: "GAMECAPTURE", label: "Game capture / culling", group: "Environment", roles: ["PILOT"] },
  { code: "INSTRUCTOR", label: "Flight instructor", group: "Instruction", roles: ["PILOT"] },
  { code: "TESTPILOT", label: "Test pilot", group: "Instruction", roles: ["PILOT"] },

  // ── Cabin crew (flight attendant) ──
  { code: "SEP", label: "Safety & emergency procedures (SEP)", group: "Safety & emergency", roles: ["CABIN_CREW"] },
  { code: "FIRE_SMOKE", label: "Firefighting & smoke", group: "Safety & emergency", roles: ["CABIN_CREW"] },
  { code: "DITCHING", label: "Ditching / water survival", group: "Safety & emergency", roles: ["CABIN_CREW"] },
  { code: "FIRST_AID", label: "First aid / aviation medicine", group: "Safety & emergency", roles: ["CABIN_CREW"] },
  { code: "DGR", label: "Dangerous goods (DGR)", group: "Compliance", roles: ["CABIN_CREW"] },
  { code: "AVSEC", label: "Aviation security (AVSEC)", group: "Compliance", roles: ["CABIN_CREW"] },
  { code: "CRM", label: "Crew resource management (CRM)", group: "Compliance", roles: ["PILOT", "CABIN_CREW"] },
  { code: "LANG_EN", label: "English language proficiency", group: "Compliance", roles: ["CABIN_CREW"] },
  { code: "VIP_SERVICE", label: "VIP / private cabin service", group: "Service", roles: ["CABIN_CREW"] },
];

export const COMPETENCY_LABEL: Record<string, string> = Object.fromEntries(COMPETENCIES.map((c) => [c.code, c.label]));
export const COMPETENCY_CODES = COMPETENCIES.map((c) => c.code) as [string, ...string[]];

export function competenciesForRole(role: string): Competency[] {
  const kind: CrewKind = role === "CABIN_CREW" ? "CABIN_CREW" : "PILOT";
  return COMPETENCIES.filter((c) => c.roles.includes(kind));
}

export function groupsForRole(role: string): string[] {
  return [...new Set(competenciesForRole(role).map((c) => c.group))];
}
