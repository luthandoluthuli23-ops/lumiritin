import Link from "next/link";
import { isCharterEnabled } from "@/lib/features";
import { COMPANY, NOT_AN_OPERATOR, SITE_CONTACT } from "@/lib/site-contact";

const link = "inline-flex items-center hover:text-ivory pointer-coarse:min-h-11";

// On every page (rendered by the root layout). Contact details show a clearly marked placeholder until they are set.
export function Footer() {
  const charterOn = isCharterEnabled();

  return (
    <footer className="border-t border-white/10 bg-obsidian-800/60 px-4 pt-14 pb-[max(3.5rem,env(safe-area-inset-bottom))] px-safe sm:px-6">
      <div className="mx-auto grid max-w-7xl gap-10 sm:grid-cols-2 md:grid-cols-4">
        <div>
          <p className="font-display text-3xl text-gold-light">Lumiritin</p>
          <p className="mt-3 text-sm text-slate-tac">The free wallet for South African pilots: licence, medical and logbook in one place.</p>
        </div>

        <nav aria-label="Platform">
          <h2 className="text-xs uppercase tracking-[0.25em] text-gold">Platform</h2>
          <ul className="mt-4 space-y-1 text-sm text-slate-tac">
            <li><Link href="/auth/signup?role=pilot" className={link}>For pilots</Link></li>
            <li><Link href="/verification" className={link}>How verification works</Link></li>
            <li><Link href="/about" className={link}>About</Link></li>
            {charterOn && <li><Link href="/charter" className={link}>Helicopter charter</Link></li>}
          </ul>
        </nav>

        <div>
          <h2 className="text-xs uppercase tracking-[0.25em] text-gold">Contact</h2>
          <ul className="mt-4 space-y-1 text-sm text-slate-tac">
            <li>
              WhatsApp / phone:{" "}
              {SITE_CONTACT.whatsappUrl ? (
                <a href={SITE_CONTACT.whatsappUrl} target="_blank" rel="noopener noreferrer" className={`${link} text-ivory`}>{SITE_CONTACT.phoneDisplay}</a>
              ) : (
                <span className="text-ivory">{SITE_CONTACT.phoneDisplay}</span>
              )}
            </li>
            <li>
              Email:{" "}
              {SITE_CONTACT.emailUrl ? (
                <a href={SITE_CONTACT.emailUrl} className={`${link} text-ivory`}>{SITE_CONTACT.email}</a>
              ) : (
                <span className="text-ivory">{SITE_CONTACT.email}</span>
              )}
            </li>
          </ul>
        </div>

        <nav aria-label="Legal">
          <h2 className="text-xs uppercase tracking-[0.25em] text-gold">Legal</h2>
          <ul className="mt-4 space-y-1 text-sm text-slate-tac">
            <li><Link href="/privacy" className={link}>Privacy policy</Link></li>
            <li><Link href="/terms" className={link}>Terms of use</Link></li>
            <li><Link href="/verification" className={link}>Verification</Link></li>
          </ul>
        </nav>
      </div>

      <div className="mx-auto mt-12 max-w-7xl border-t border-white/10 pt-6 text-xs leading-relaxed text-slate-tac">
        <p>
          {NOT_AN_OPERATOR} Pilot credential details are checked against SACAA records with the holder&rsquo;s consent and shown for
          convenience; the SACAA record remains authoritative.
        </p>
        <p className="mt-3">© {new Date().getFullYear()} {COMPANY.companyName}</p>
      </div>
    </footer>
  );
}
