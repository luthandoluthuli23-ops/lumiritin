"use client";

import { useState, type FormEvent, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { EASE_LUXE } from "@/lib/animations";
import type { AirfieldOption } from "@/lib/geo";
import { ROLE_LABEL, type Role } from "@/lib/roles";
import { NearestAirfieldPicker } from "@/components/charter/NearestAirfieldPicker";
import { AirfieldAutocomplete } from "@/components/charter/AirfieldAutocomplete";
import { FormError, TextField, apiErrorMessage, ghostBtn, primaryBtn } from "@/components/ui/Field";

const ROLES: { id: Role; blurb: string; icon: string }[] = [
  { id: "PASSENGER", blurb: "Charter a jet or fly an empty leg at up to 75% off.", icon: "M2 16l20-7-7 20-3-9-10-4z" },
  { id: "OPERATOR", blurb: "Manage your fleet, publish empty legs and post urgent crew needs.", icon: "M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6" },
  { id: "PILOT", blurb: "Keep your SACAA credentials current and get matched to contract flights.", icon: "M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7l8-4zM9 12l2 2 4-4" },
];

interface Props {
  airfields: AirfieldOption[];
  initialRole: Role | null;
  next: string | null;
}

export function SignupFlow({ airfields, initialRole, next }: Props) {
  const router = useRouter();
  const [role, setRole] = useState<Role | null>(initialRole);
  const [home, setHome] = useState("");
  const [base, setBase] = useState("");
  const [ratings, setRatings] = useState<string[]>([]);
  const [ratingDraft, setRatingDraft] = useState("");
  const [consentWhatsapp, setConsentWhatsapp] = useState(false);
  const [whatsapp, setWhatsapp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addRating() {
    const parts = ratingDraft.split(/[,\s]+/).map((s) => s.trim().toUpperCase()).filter(Boolean);
    if (parts.length) setRatings((r) => [...new Set([...r, ...parts])].slice(0, 12));
    setRatingDraft("");
  }
  function onRatingKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addRating();
    }
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!role) return;
    const f = new FormData(e.currentTarget);
    const v = (k: string) => String(f.get(k) ?? "");
    const common = { role, email: v("email"), password: v("password"), firstName: v("firstName"), lastName: v("lastName") };

    const body =
      role === "PASSENGER"
        ? { ...common, phone: v("phone"), homeAirfieldIcao: home || undefined }
        : role === "OPERATOR"
          ? { ...common, companyName: v("companyName"), aocNumber: v("aocNumber"), baseIcao: base }
          : {
              ...common,
              licenceNumber: v("licenceNumber"),
              homeAirfieldIcao: home || undefined,
              whatsapp,
              typeRatings: [...ratings, ...ratingDraft.split(/[,\s]+/).filter(Boolean)].map((s) => s.toUpperCase()),
              consentVerification: f.get("consentVerification") === "on",
              consentWhatsapp,
            };

    if (role === "OPERATOR" && !base) return setError("Choose your primary hangar base.");

    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(apiErrorMessage(data));
        return;
      }
      router.push(next ?? data.redirect);
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div role="radiogroup" aria-label="Account type" className="grid gap-4 md:grid-cols-3">
        {ROLES.map((r) => {
          const on = role === r.id;
          return (
            <motion.button
              key={r.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setRole(r.id)}
              whileHover={{ y: -4 }}
              whileTap={{ scale: 0.985 }}
              className={`glass relative rounded-3xl p-6 text-left transition-colors ${on ? "border-gold/70 bg-gold/10 shadow-gold" : "hover:border-white/25"}`}
            >
              <svg viewBox="0 0 24 24" className={`h-7 w-7 fill-none stroke-2 ${on ? "stroke-gold-light" : "stroke-slate-tac"}`} aria-hidden>
                <path d={r.icon} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <h3 className="mt-4 font-display text-2xl text-ivory">{ROLE_LABEL[r.id]}</h3>
              <p className="mt-2 text-sm text-slate-tac">{r.blurb}</p>
              {on && (
                <motion.span layoutId="role-check" className="absolute right-5 top-5 flex h-6 w-6 items-center justify-center rounded-full bg-gold text-obsidian" aria-hidden>
                  <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-[3]"><path d="M5 13l4 4L19 7" /></svg>
                </motion.span>
              )}
            </motion.button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        {role && (
          <motion.form
            key={role}
            onSubmit={submit}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE_LUXE } }}
            exit={{ opacity: 0, y: -12, transition: { duration: 0.2 } }}
            className="glass mt-8 grid gap-5 rounded-3xl p-6 sm:grid-cols-2 sm:p-8"
          >
            <TextField label="First name" name="firstName" autoComplete="given-name" required maxLength={60} />
            <TextField label="Last name" name="lastName" autoComplete="family-name" required maxLength={60} />
            <TextField label="Email" name="email" type="email" autoComplete="email" required />
            <TextField label="Password" name="password" type="password" autoComplete="new-password" required minLength={10} hint="At least 10 characters." />

            {role === "PASSENGER" && (
              <>
                <TextField label="Phone" name="phone" type="tel" autoComplete="tel" required placeholder="082 123 4567" />
                <div className="sm:col-span-2">
                  <NearestAirfieldPicker airfields={airfields} value={home} onChange={setHome} label="Home / preferred airfield" />
                </div>
              </>
            )}

            {role === "OPERATOR" && (
              <>
                <TextField label="Company name" name="companyName" required maxLength={120} />
                <TextField label="AOC number" name="aocNumber" required placeholder="Air Operator Certificate no." hint="Your SACAA Air Operator Certificate." />
                <div className="sm:col-span-2">
                  <AirfieldAutocomplete airfields={airfields} value={base} onChange={setBase} label="Primary hangar base" required />
                </div>
              </>
            )}

            {role === "PILOT" && (
              <>
                <TextField label="SACAA licence number" name="licenceNumber" required placeholder="e.g. 0270999999" />
                <TextField label="WhatsApp number" name="whatsapp" type="tel" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="082 123 4567" hint="For expiry reminders at 90, 30 and 7 days." />
                <div className="sm:col-span-2">
                  <NearestAirfieldPicker airfields={airfields} value={home} onChange={setHome} label="Home airfield" />
                  <p className="mt-1.5 text-xs text-slate-tac">Operators near you are matched to you first.</p>
                </div>
                <div className="sm:col-span-2">
                  <label className="block">
                    <span className="text-xs uppercase tracking-widest text-slate-tac">Aircraft type ratings</span>
                    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 focus-within:border-gold/60">
                      {ratings.map((r) => (
                        <span key={r} className="flex items-center gap-1 rounded-full bg-gold/15 px-3 py-1 text-xs text-gold-light">
                          {r}
                          <button type="button" aria-label={`Remove ${r}`} onClick={() => setRatings((x) => x.filter((y) => y !== r))} className="text-slate-tac hover:text-ivory">×</button>
                        </span>
                      ))}
                      <input
                        value={ratingDraft}
                        onChange={(e) => setRatingDraft(e.target.value)}
                        onKeyDown={onRatingKey}
                        onBlur={addRating}
                        placeholder={ratings.length ? "" : "e.g. B737, PC12, C525: press Enter to add"}
                        className="min-w-40 flex-1 bg-transparent py-1.5 text-ivory outline-none placeholder:text-slate-tac/60"
                      />
                    </div>
                    <span className="mt-1.5 block text-xs text-slate-tac">Self-declared; confirmed against your SACAA record once verification is connected.</span>
                  </label>
                </div>
                <div className="space-y-3 sm:col-span-2">
                  <label className="flex items-start gap-3 text-sm text-slate-tac">
                    <input type="checkbox" name="consentVerification" required className="mt-1 accent-[#d4af37]" />
                    <span>I consent to Lumiritin looking up my licence, ratings and medical on the SACAA portal, including nightly re-checks, to keep my wallet current (POPIA).</span>
                  </label>
                  <label className="flex items-start gap-3 text-sm text-slate-tac">
                    <input type="checkbox" checked={consentWhatsapp} onChange={(e) => setConsentWhatsapp(e.target.checked)} className="mt-1 accent-[#d4af37]" />
                    <span>I consent to WhatsApp messages about expiring credentials. {whatsapp ? "Required to receive reminders." : "Only needed if you add a number."}</span>
                  </label>
                </div>
              </>
            )}

            <div className="space-y-4 sm:col-span-2">
              <FormError message={error} />
              <div className="flex flex-wrap items-center gap-4">
                <button type="submit" disabled={busy} className={primaryBtn}>
                  {busy ? "Creating account…" : `Create ${ROLE_LABEL[role].toLowerCase()} account`}
                </button>
                <button type="button" onClick={() => setRole(null)} className={ghostBtn}>Change account type</button>
              </div>
            </div>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}
