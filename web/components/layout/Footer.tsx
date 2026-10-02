import Link from "next/link";

const AIRFIELD_LINKS = [
  { icao: "FAPM", city: "Pietermaritzburg" },
  { icao: "FALA", city: "Lanseria, Johannesburg" },
  { icao: "FACT", city: "Cape Town" },
];

export function Footer() {
  // Public by design (NEXT_PUBLIC_*). Hidden until configured so no placeholder number is ever shown.
  const whatsapp = process.env.NEXT_PUBLIC_WHATSAPP_CONCIERGE_E164?.replace(/[^\d]/g, "");

  return (
    <footer className="border-t border-white/10 bg-obsidian-800/60 px-6 py-14">
      <div className="mx-auto grid max-w-7xl gap-10 md:grid-cols-4">
        <div className="md:col-span-1">
          <p className="font-display text-3xl text-gold-light">Lumiritin</p>
          <p className="mt-3 text-sm text-slate-tac">Private aviation for South Africa: charter, empty legs and verified crew.</p>
        </div>

        <nav aria-label="Airfields">
          <h2 className="text-xs uppercase tracking-[0.25em] text-gold">Fly from</h2>
          <ul className="mt-4 space-y-2 text-sm">
            {AIRFIELD_LINKS.map((a) => (
              <li key={a.icao}>
                <Link href={`/empty-legs?from=${a.icao}`} className="text-slate-tac transition hover:text-ivory">
                  <span className="font-mono text-ivory">{a.icao}</span> · {a.city}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="Platform">
          <h2 className="text-xs uppercase tracking-[0.25em] text-gold">Platform</h2>
          <ul className="mt-4 space-y-2 text-sm text-slate-tac">
            <li><Link href="/empty-legs" className="hover:text-ivory">Empty legs</Link></li>
            <li><Link href="/charter" className="hover:text-ivory">Custom charter</Link></li>
            <li><Link href="/auth/signup?role=operator" className="hover:text-ivory">For operators</Link></li>
            <li><Link href="/auth/signup?role=pilot" className="hover:text-ivory">For pilots</Link></li>
          </ul>
        </nav>

        <div>
          <h2 className="text-xs uppercase tracking-[0.25em] text-gold">Concierge</h2>
          {whatsapp ? (
            <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-2 rounded-full border border-emerald-status/40 px-4 py-2 text-sm text-emerald-status transition hover:bg-emerald-status/10">
              Chat on WhatsApp
            </a>
          ) : (
            <p className="mt-4 text-sm text-slate-tac">Concierge details coming soon.</p>
          )}
        </div>
      </div>

      <div className="mx-auto mt-12 max-w-7xl border-t border-white/10 pt-6 text-xs leading-relaxed text-slate-tac">
        <p>
          Lumiritin is a booking and credentialing platform, not an air operator. Charter and empty-leg flights are operated by
          third-party Air Operator Certificate holders regulated by the South African Civil Aviation Authority (SACAA). Pilot credential
          data is looked up from SACAA records with the holder&rsquo;s consent and is shown for convenience; the SACAA record remains authoritative.
        </p>
        <p className="mt-3">© {new Date().getFullYear()} Lumiritin</p>
      </div>
    </footer>
  );
}
