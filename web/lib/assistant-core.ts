// Pure pieces of the site assistant ("Ask Lumi"): which pages it may send someone to, how those links are built and
// checked against the visitor's role, and how chat history from the browser is cleaned before it reaches the model.
// No Prisma, no network: shared by the API route and the tests.
import type { Role } from "@/lib/roles";

export interface PageDef {
  /** Plain-language name shown on the button in the chat. */
  label: string;
  path: string;
  /** Role needed to see the page; null means public. */
  role: Role | null;
  /** Query parameters the assistant may pre-fill. */
  params?: readonly ("from" | "to" | "date" | "pax" | "role")[];
}

/** The ONLY places the assistant can take someone. Anything else is refused, so the model can't invent a URL. */
export const PAGES = {
  home: { label: "Home", path: "/", role: null },
  charter: { label: "Charter request", path: "/charter", role: null, params: ["from", "to", "date", "pax"] },
  empty_legs: { label: "Empty leg deals", path: "/empty-legs", role: null, params: ["from", "to", "date"] },
  try_lumi: { label: "Try Lumi on a document", path: "/try-lumi", role: null },
  sign_in: { label: "Sign in", path: "/auth/signin", role: null },
  sign_up: { label: "Create an account", path: "/auth/signup", role: null, params: ["role"] },
  my_bookings: { label: "My bookings", path: "/dashboard/bookings", role: "PASSENGER" },
  my_empty_leg_bookings: { label: "My empty-leg bookings", path: "/dashboard/empty-legs", role: "PASSENGER" },
  credential_wallet: { label: "Credential wallet", path: "/wallet", role: "PILOT" },
  reputation: { label: "My reputation", path: "/wallet/insights", role: "PILOT" },
  logbook: { label: "Logbook", path: "/wallet/logbook", role: "PILOT" },
  operator_dashboard: { label: "Operator dashboard", path: "/operator/dashboard", role: "OPERATOR" },
  fleet: { label: "Fleet", path: "/operator/fleet", role: "OPERATOR" },
  crew_requests: { label: "Crew requests", path: "/operator/crewing", role: "OPERATOR" },
  new_crew_request: { label: "Crew dispatcher", path: "/operator/crewing/new", role: "OPERATOR" },
  bench: { label: "Bench", path: "/operator/bench", role: "OPERATOR" },
  my_pilots: { label: "My pilots", path: "/operator/pilots", role: "OPERATOR" },
  operator_insights: { label: "Operator insights", path: "/operator/insights", role: "OPERATOR" },
  notifications: { label: "Notifications", path: "/operator/notifications", role: "OPERATOR" },
  publish_empty_leg: { label: "Publish an empty leg", path: "/operator/empty-legs/new", role: "OPERATOR" },
} as const satisfies Record<string, PageDef>;

export type PageKey = keyof typeof PAGES;
export const PAGE_KEYS = Object.keys(PAGES) as PageKey[];
export const isPageKey = (v: unknown): v is PageKey => typeof v === "string" && Object.prototype.hasOwnProperty.call(PAGES, v);

const ICAO = /^[A-Z]{4}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SIGNUP_ROLES = new Set(["pilot", "operator"]); // passengers use the plain sign-up page

const ROLE_WORD: Record<Role, string> = { PASSENGER: "a passenger", PILOT: "a pilot / crew member", OPERATOR: "an aircraft operator" };

export type OpenPageResult =
  | { ok: true; href: string; label: string }
  | { ok: false; error: string };

/**
 * Builds a validated same-site link, or explains why not. Parameters that don't validate are dropped (never passed
 * through), so the model can't smuggle anything into a URL. Pages reserved for a role refuse anyone else.
 */
export function openPage(input: { page?: unknown; from?: unknown; to?: unknown; date?: unknown; pax?: unknown; role?: unknown }, viewer: Role | null, todayIso: string): OpenPageResult {
  if (!isPageKey(input.page)) return { ok: false, error: `Unknown page. Valid pages: ${PAGE_KEYS.join(", ")}.` };
  const def: PageDef = PAGES[input.page];

  if (def.role && viewer !== def.role) {
    return {
      ok: false,
      error: viewer
        ? `That page is only for ${ROLE_WORD[def.role]}; the visitor is signed in as ${ROLE_WORD[viewer]}. Tell them, and point them to something suitable.`
        : `That page needs the visitor to sign in as ${ROLE_WORD[def.role]}. Offer to open the sign-in page (sign_in) or sign-up page (sign_up).`,
    };
  }

  const q = new URLSearchParams();
  const allowed = new Set<string>(def.params ?? []);
  const from = typeof input.from === "string" ? input.from.trim().toUpperCase() : "";
  const to = typeof input.to === "string" ? input.to.trim().toUpperCase() : "";
  const date = typeof input.date === "string" ? input.date.trim() : "";
  const pax = typeof input.pax === "number" ? input.pax : Number(input.pax);
  if (allowed.has("from") && ICAO.test(from)) q.set("from", from);
  if (allowed.has("to") && ICAO.test(to)) q.set("to", to);
  if (allowed.has("date") && DATE.test(date) && date >= todayIso) q.set("date", date);
  if (allowed.has("pax") && Number.isInteger(pax) && pax >= 1 && pax <= 12) q.set("pax", String(pax));
  if (allowed.has("role") && typeof input.role === "string" && SIGNUP_ROLES.has(input.role)) q.set("role", input.role);

  const qs = q.toString();
  return { ok: true, href: qs ? `${def.path}?${qs}` : def.path, label: def.label };
}

// ── Conversation hygiene ───────────────────────────────────────────────────────

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export const MAX_TURNS = 12;
export const MAX_TURN_CHARS = 1200;

/**
 * Cleans the history the browser sent: text turns only, bounded in number and size, starting with a user turn and
 * strictly alternating (the Messages API requires it). Returns null if there is no usable final user message.
 */
export function sanitizeHistory(raw: unknown): ChatTurn[] | null {
  if (!Array.isArray(raw)) return null;
  const turns: ChatTurn[] = [];
  for (const t of raw) {
    if (!t || typeof t !== "object") continue;
    const { role, content } = t as { role?: unknown; content?: unknown };
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") continue;
    const text = content.replace(/\u0000/g, "").trim().slice(0, MAX_TURN_CHARS);
    if (!text) continue;
    const prev = turns[turns.length - 1];
    if (prev && prev.role === role) prev.content = `${prev.content}\n${text}`.slice(0, MAX_TURN_CHARS); // merge same-role runs
    else turns.push({ role, content: text });
  }
  const recent = turns.slice(-MAX_TURNS);
  while (recent.length && recent[0].role !== "user") recent.shift();
  if (!recent.length || recent[recent.length - 1].role !== "user") return null;
  return recent;
}
