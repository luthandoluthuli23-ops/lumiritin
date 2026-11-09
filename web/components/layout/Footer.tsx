import Link from "next/link";

// Major commercial airports across South Africa. ICAO codes match lib/airfields.ts so the /charter links prefill.
const AIRFIELD_LINKS = [
  { icao: "FAOR", city: "O.R. Tambo, JHB" },
  { icao: "FALA", city: "Lanseria, JHB" },
  { icao: "FACT", city: "Cape Town" },
  { icao: "FADN", city: "King Shaka, Durban" },
  { icao: "FAPE", city: "Gqeberha (PE)" },
  { icao: "FAPM", city: "Pietermaritzburg" },
  { icao: "FABL", city: "Bloemfontein" },
  { icao: "FAEL", city: "East London" },
  { icao: "FAGG", city: "George" },
  { icao: "FAKM", city: "Kimberley" },
  { icao: "FAKN", city: "Kruger Mpumalanga" },
  { icao: "FAUP", city: "Upington" },
];

export function Footer() {
  // Public by design (NEXT_PUBLIC_*). Hidden until configured so no placeholder number is ever shown.
  const whatsapp = process.env.NEXT_PUBLIC_WHATSAPP_CONCIERGE_E164?.replace(/[^\d]/g, "");

  return (
    <footer className="border-t border-white/10 bg-obsidian-800/60 px-4 pt-14 pb-[max(3.5rem,env(safe-area-inset-bottom))] px-safe sm:px-6">
      <div className="mx-auto grid max-w-7xl gap-10 md:grid-cols-6">
        <div className="md:col-span-1">
          <p className="font-display text-3xl text-gold-light">Lumiritin</p>
          <p className="mt-3 text-sm text-slate-tac">Private aircraft charter for South Africa, with SACAA-verified crew.</p>
        </div>

        <nav aria-label="Airfields" className="md:col-span-2">
          <h2 className="text-xs uppercase tracking-[0.25em] text-gold">Fly from</h2>
          <ul className="mt-4 grid grid-cols-1 gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
            {AIRFIELD_LINKS.map((a) => (
              <li key={a.icao}>
                <Link href={`/charter?from=${a.icao}`} className="inline-flex items-center text-slate-tac transition hover:text-ivory pointer-coarse:min-h-11">
                  <span className="font-mono text-ivory">{a.icao}</span> · {a.city}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="Platform">
          <h2 className="text-xs uppercase tracking-[0.25em] text-gold">Platform</h2>
          <ul className="mt-4 space-y-1 text-sm text-slate-tac">
            <li><Link href="/charter" className="inline-flex items-center hover:text-ivory pointer-coarse:min-h-11">Helicopter charter</Link></li>
            <li><Link href="/auth/signup?role=operator" className="inline-flex items-center hover:text-ivory pointer-coarse:min-h-11">For operators</Link></li>
            <li><Link href="/auth/signup?role=pilot" className="inline-flex items-center hover:text-ivory pointer-coarse:min-h-11">For pilots</Link></li>
          </ul>
        </nav>

        <div className="md:col-span-2">
          <h2 className="text-xs uppercase tracking-[0.25em] text-gold">Concierge</h2>
          {whatsapp ? (
            <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-2 rounded-full border border-emerald-status/40 px-4 py-2 text-sm text-emerald-status transition hover:bg-emerald-status/10 pointer-coarse:min-h-11">
              Chat on WhatsApp
            </a>
          ) : (
            <div className="mt-4 flex items-center gap-3">
              <LumiJet />
              <div>
                <p className="text-sm font-medium text-ivory">Lumi is on the way ✈️</p>
                <p className="text-xs text-slate-tac">Your AI concierge is still doing its pre-flight checks.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto mt-12 max-w-7xl border-t border-white/10 pt-6 text-xs leading-relaxed text-slate-tac">
        <p>
          Lumiritin is a booking and credentialing platform, not an air operator. Charter flights are operated by
          third-party Air Operator Certificate holders regulated by the South African Civil Aviation Authority (SACAA). Pilot credential
          data is looked up from SACAA records with the holder&rsquo;s consent and is shown for convenience; the SACAA record remains authoritative.
        </p>
        <p className="mt-3">© {new Date().getFullYear()} Lumiritin</p>
      </div>
    </footer>
  );
}

/** Lumi, the concierge-in-waiting: a little gold plane that flies around in a circle, nose leading. */
function LumiJet() {
  return (
    <span className="lumi-jet-wrap" aria-hidden>
      <svg viewBox="0 0 40 40" className="lumi-jet">
        <g fill="#e2b857">
          {/* big swept wings */}
          <path d="M22 18 L7 5 L29 17 Z" />
          <path d="M22 22 L7 35 L29 23 Z" />
          {/* tail stabilizers */}
          <path d="M12 18.5 L5 11 L18 18.5 Z" />
          <path d="M12 21.5 L5 29 L18 21.5 Z" />
          {/* short fuselage, pointed nose to the right */}
          <path d="M10 20 C10 17.4 13 17 18 17 L28 17.3 L34 20 L28 22.7 L18 23 C13 23 10 22.6 10 20 Z" />
        </g>
      </svg>
    </span>
  );
}
