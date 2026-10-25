// Specialised helicopter-pilot proficiencies (SACAA Part 61 ratings/endorsements and common
// operational competencies operators hire for). Stored as codes on Person.proficiencies.
export interface Proficiency {
  code: string;
  label: string;
  group: "Core ratings" | "Specialised operations" | "Environment" | "Instruction";
}

export const PROFICIENCIES: readonly Proficiency[] = [
  { code: "NIGHT", label: "Night rating", group: "Core ratings" },
  { code: "IF", label: "Instrument (IFR)", group: "Core ratings" },
  { code: "NVG", label: "Night vision goggles (NVG)", group: "Core ratings" },

  { code: "SLING", label: "Sling / external load (HESLO)", group: "Specialised operations" },
  { code: "LONGLINE", label: "Long-line", group: "Specialised operations" },
  { code: "WINCH", label: "Winch / hoist", group: "Specialised operations" },
  { code: "FIREFIGHT", label: "Firefighting (bucket / tank)", group: "Specialised operations" },
  { code: "HEMS", label: "HEMS / air ambulance", group: "Specialised operations" },
  { code: "SURVEY", label: "Aerial survey / powerline", group: "Specialised operations" },

  { code: "MOUNTAIN", label: "Mountain flying", group: "Environment" },
  { code: "OFFSHORE", label: "Offshore", group: "Environment" },
  { code: "GAMECAPTURE", label: "Game capture / culling", group: "Environment" },

  { code: "INSTRUCTOR", label: "Flight instructor", group: "Instruction" },
  { code: "TESTPILOT", label: "Test pilot", group: "Instruction" },
];

export const PROFICIENCY_LABEL: Record<string, string> = Object.fromEntries(PROFICIENCIES.map((p) => [p.code, p.label]));
export const PROFICIENCY_CODES = PROFICIENCIES.map((p) => p.code) as [string, ...string[]];
export const PROFICIENCY_GROUPS = ["Core ratings", "Specialised operations", "Environment", "Instruction"] as const;
