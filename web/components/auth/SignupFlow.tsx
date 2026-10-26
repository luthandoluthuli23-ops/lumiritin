"use client";

import { useState, type FormEvent, type KeyboardEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { EASE_LUXE } from "@/lib/animations";
import type { AirfieldOption } from "@/lib/geo";
import { ROLE_LABEL, type Role } from "@/lib/roles";
import { NearestAirfieldPicker } from "@/components/charter/NearestAirfieldPicker";
import { AirfieldAutocomplete } from "@/components/charter/AirfieldAutocomplete";
import { FormError, TextField, apiErrorMessage, ghostBtn, primaryBtn } from "@/components/ui/Field";
import { PasswordField } from "@/components/ui/PasswordField";

const ROLES: { id: Role; blurb: string; icon: string }[] = [
  { id: "PASSENGER", blurb: "Charter an aircraft on demand across South Africa.", icon: "M2 16l20-7-7 20-3-9-10-4z" },
  { id: "OPERATOR", blurb: "Manage your fleet and crew, and post urgent crew needs.", icon: "M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6" },
  { id: "PILOT", blurb: "Pilot or cabin crew: keep your SACAA credentials current and get matched to flights.", icon: "M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7l8-4zM9 12l2 2 4-4" },
];

interface Props {
  airfields: AirfieldOption[];
  initialRole: Role | null;
  next: string | null;
}

export function SignupFlow({ airfields, initialRole, next }: Props) {
  const [role, setRole] = useState<Role | null>(initialRole);
  const [isPrivate, setIsPrivate] = useState(false);
  const [crewRole, setCrewRole] = useState<"PILOT" | "CABIN_CREW">("PILOT");
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
          ? { ...common, companyName: v("companyName"), aocNumber: isPrivate ? "" : v("aocNumber"), isPrivate, baseIcao: base }
          : {
              ...common,
              crewRole,
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
        setBusy(false);
        return;
      }
      // Full navigation so the new session renders reliably (in-app nav could stall); keep the
      // button loading until the page changes.
      window.location.assign(next ?? data.redirect);
    } catch {
      setError("Network error. Please try again.");
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
            <PasswordField label="Password" name="password" autoComplete="new-password" required minLength={10} hint="At least 10 characters." />

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
                <div className="sm:col-span-2">
                  <span className="text-xs uppercase tracking-widest text-slate-tac">Operator type</span>
                  <div className="mt-2 inline-flex gap-1 rounded-2xl bg-obsidian-800 p-1">
                    {([[false, "Commercial (AOC holder)"], [true, "Private (own aircraft)"]] as const).map(([val, lbl]) => (
                      <button
                        key={lbl}
                        type="button"
                        onClick={() => setIsPrivate(val)}
                        aria-pressed={isPrivate === val}
                        className={`rounded-xl px-4 py-2 text-sm transition ${isPrivate === val ? "bg-gold text-obsidian" : "text-slate-tac hover:text-ivory"}`}
                      >
                        {lbl}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1.5 text-xs text-slate-tac">
                    {isPrivate
                      ? "For private owners flying their own helicopter or aircraft — no Air Operator Certificate needed."
                      : "For AOC holders operating commercially."}
                  </p>
                </div>
                <TextField label={isPrivate ? "Operation name" : "Company name"} name="companyName" required maxLength={120} />
                {!isPrivate && <TextField label="AOC number" name="aocNumber" required placeholder="Air Operator Certificate no." hint="Your SACAA Air Operator Certificate." />}
                <div className="sm:col-span-2">
                  <AirfieldAutocomplete airfields={airfields} value={base} onChange={setBase} label={isPrivate ? "Home base" : "Primary hangar base"} required />
                </div>
              </>
            )}

            {role === "PILOT" && (
              <>
                <div className="sm:col-span-2">
                  <span className="text-xs uppercase tracking-widest text-slate-tac">I am a</span>
                  <div className="mt-2 inline-flex gap-1 rounded-2xl bg-obsidian-800 p-1">
                    {([["PILOT", "Pilot"], ["CABIN_CREW", "Cabin crew"]] as const).map(([val, lbl]) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setCrewRole(val)}
                        aria-pressed={crewRole === val}
                        className={`rounded-xl px-4 py-2 text-sm transition ${crewRole === val ? "bg-gold text-obsidian" : "text-slate-tac hover:text-ivory"}`}
                      >
                        {lbl}
                      </button>
                    ))}
                  </div>
                </div>
                <TextField
                  label={crewRole === "CABIN_CREW" ? "Cabin Crew Member Licence no." : "SACAA licence number"}
                  name="licenceNumber"
                  required
                  placeholder={crewRole === "CABIN_CREW" ? "your CCML number" : "e.g. 0270999999"}
                />
                <TextField label="WhatsApp number" name="whatsapp" type="tel" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="082 123 4567" hint="For expiry reminders at 90, 30 and 7 days." />
                <div className="sm:col-span-2">
                  <NearestAirfieldPicker airfields={airfields} value={home} onChange={setHome} label="Home airfield" />
                  <p className="mt-1.5 text-xs text-slate-tac">Operators near you are matched to you first.</p>
                </div>
                <div className="sm:col-span-2">
                  <label className="block">
                    <span className="text-xs uppercase tracking-widest text-slate-tac">{crewRole === "CABIN_CREW" ? "Aircraft types trained on" : "Aircraft type ratings"}</span>
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
