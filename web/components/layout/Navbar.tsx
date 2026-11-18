"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { primaryBtn, primaryBtnSm } from "@/components/ui/Field";
import { EASE_LUXE } from "@/lib/animations";
import { ROLE_LABEL, type Role } from "@/lib/roles";
import { isCharterEnabled } from "@/lib/features";

interface NavLink {
  href: string;
  label: string;
}

/** The one "Charter" item (only when CHARTER_PUBLIC is on). Aeroplane charter isn't offered yet, so it says so. */
const CHARTER_MENU: { label: string; href: string | null }[] = [
  { label: "Aeroplane", href: null },
  { label: "Helicopter", href: "/charter" },
];

// Pilot-first: visitors see the wallet story. Charter, empty legs and operator sign-up keep their routes but aren't promoted.
const PUBLIC_LINKS: NavLink[] = [
  { href: "/auth/signup?role=pilot", label: "For pilots" },
  { href: "/verification", label: "Verification" },
  { href: "/about", label: "About" },
];

const LINKS: Record<Role, NavLink[]> = {
  PASSENGER: [{ href: "/dashboard/bookings", label: "My bookings" }],
  OPERATOR: [
    { href: "/operator/dashboard", label: "Dashboard" },
    { href: "/operator/fleet", label: "Fleet" },
    { href: "/operator/crewing", label: "Crewing" },
    { href: "/operator/bench", label: "Bench" },
  ],
  PILOT: [
    { href: "/wallet", label: "Credential wallet" },
    { href: "/wallet/insights", label: "My reputation" },
    { href: "/wallet/logbook", label: "Logbook" },
    { href: "/wallet/settings", label: "Settings" },
  ],
};

const CTA: Record<Role, NavLink> = {
  PASSENGER: { href: "/dashboard/bookings", label: "My bookings" },
  OPERATOR: { href: "/operator/crewing/new", label: "Post crew request" },
  PILOT: { href: "/wallet/verify", label: "Get verified" },
};

interface Props {
  session: { name: string; role: Role } | null;
  /** Shows the passwordless demo role switcher. Only true in non-production builds. */
  demoSwitcher: boolean;
}

// Every control in the bar is at least 44px on touch screens (pointer-coarse), compact with a mouse.
const barLink = "inline-flex items-center rounded-full px-3.5 py-1.5 transition hover:bg-white/5 hover:text-ivory pointer-coarse:min-h-11";
const quietBtn = "inline-flex items-center px-3 py-1.5 text-sm text-slate-tac transition hover:text-ivory pointer-coarse:min-h-11";
const menuItem = "flex min-h-11 w-full items-center rounded-xl px-3 py-2.5 text-left hover:bg-white/5";

export function Navbar({ session, demoSwitcher }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Charter appears only when CHARTER_PUBLIC is on, and only for visitors and passengers (lib/features.ts).
  const showCharter = isCharterEnabled() && (!session || session.role === "PASSENGER");
  const links = session ? LINKS[session.role] : PUBLIC_LINKS;
  const cta = session ? CTA[session.role] : { href: "/auth/signup?role=pilot", label: "Create free wallet" };
  const [charterOpen, setCharterOpen] = useState(false);
  useEffect(() => setCharterOpen(false), [pathname]);

  // The mobile menu closes on navigation and on Escape, and the page behind it doesn't scroll while it is open.
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  async function post(url: string, body?: unknown): Promise<{ redirect?: string } | null> {
    setBusy(true);
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      return res.ok ? await res.json() : null;
    } finally {
      setBusy(false);
    }
  }
  async function switchRole(role: Role) {
    const data = await post("/api/auth/demo", { role });
    if (data?.redirect) {
      setOpen(false);
      router.push(data.redirect);
      router.refresh();
    }
  }
  async function signOut() {
    await post("/api/auth/signout");
    setOpen(false);
    // Hard-navigate home so the page renders once as signed-out (correct navbar), with no gap.
    window.location.assign("/");
  }

  return (
    <header className="fixed inset-x-0 top-[max(1rem,env(safe-area-inset-top))] z-40 px-4 px-safe">
      <div className="glass mx-auto max-w-7xl rounded-3xl bg-glass/80 shadow-lg shadow-black/30">
        <div className="flex h-14 items-center justify-between gap-2 pl-5 pr-2 sm:gap-4 sm:pl-6 sm:pr-3">
          <Link href="/" className="inline-flex min-h-11 items-center font-display text-2xl font-semibold tracking-wide text-gold-light">Lumiritin</Link>

          <nav aria-label="Main" className="hidden items-center gap-1 text-sm text-slate-tac lg:flex">
            {showCharter && (
              <div className="relative" onKeyDown={(e) => e.key === "Escape" && setCharterOpen(false)}>
                <button type="button" aria-expanded={charterOpen} aria-controls="charter-menu" onClick={() => setCharterOpen((o) => !o)} className={`${barLink} gap-1 ${pathname.startsWith("/charter") ? "bg-white/5 text-ivory" : ""}`}>
                  Charter
                  <svg viewBox="0 0 20 20" className="h-4 w-4 fill-current" aria-hidden><path d="M5.5 7.5 10 12l4.5-4.5" stroke="currentColor" strokeWidth="1.6" fill="none" /></svg>
                </button>
                {charterOpen && (
                  <ul id="charter-menu" className="absolute left-0 top-full mt-2 min-w-48 rounded-2xl border border-white/10 bg-obsidian p-2 shadow-xl">
                    {CHARTER_MENU.map((c) => (
                      <li key={c.label}>
                        {c.href ? (
                          <Link href={c.href} className={`${menuItem} text-ivory`}>{c.label}</Link>
                        ) : (
                          <span className={`${menuItem} justify-between text-slate-tac`} aria-disabled="true">
                            {c.label} <span className="text-xs">Coming soon</span>
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {links.map((l) => {
              // Links that differ only by query string (the two sign-up roles) have no single "current page".
              const on = !l.href.includes("?") && pathname === l.href;
              return (
                <Link key={l.href} href={l.href} aria-current={on ? "page" : undefined} className={`${barLink} ${on ? "bg-white/5 text-ivory" : ""}`}>
                  {l.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-1 sm:gap-2">
            {demoSwitcher && <RoleSwitcher current={session?.role ?? null} busy={busy} onPick={switchRole} className="hidden xl:flex" />}
            {session ? (
              <button type="button" onClick={signOut} disabled={busy} className={`${quietBtn} max-sm:hidden`} title={`Signed in as ${session.name}`}>
                Sign out
              </button>
            ) : (
              <Link href="/auth/signin" className={`${quietBtn} max-sm:hidden`}>Sign in</Link>
            )}
            {/* On phones the main action lives at the top of the menu: a long label can't squeeze the bar.
                (max-sm:hidden, not hidden + sm:inline-flex: both set `display` and the winner would depend on CSS order.) */}
            <Link href={cta.href} className={`${primaryBtnSm} max-sm:hidden`}>{cta.label}</Link>
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-controls="mobile-menu"
              aria-label="Menu"
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ivory hover:bg-white/10 lg:hidden"
            >
              <svg viewBox="0 0 24 24" className="h-6 w-6 fill-none stroke-current stroke-2" aria-hidden>{open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}</svg>
            </button>
          </div>
        </div>

        <AnimatePresence>
          {open && (
            <motion.div id="mobile-menu" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1, transition: { duration: 0.3, ease: EASE_LUXE } }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden lg:hidden">
              {/* Solid background: the header is fixed over page content, so a translucent menu let the
                  hero text show through and the links looked overlapped/unreadable. Scrolls if taller than the screen. */}
              <div className="max-h-[calc(100dvh-6.5rem)] space-y-1 overflow-y-auto overscroll-contain rounded-b-3xl border-t border-white/10 bg-obsidian p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                {session && <p className="px-3 pb-2 text-xs text-slate-tac">{session.name} · {ROLE_LABEL[session.role]}</p>}
                <Link href={cta.href} onClick={() => setOpen(false)} className={`${primaryBtn} mb-2 flex w-full items-center justify-center sm:hidden`}>{cta.label}</Link>
                {showCharter && (
                  <div className="pb-1">
                    <p className="px-3 pt-1 text-xs uppercase tracking-widest text-slate-tac">Charter</p>
                    {CHARTER_MENU.map((c) =>
                      c.href ? (
                        <Link key={c.label} href={c.href} onClick={() => setOpen(false)} className={`${menuItem} pl-6 text-ivory`}>{c.label}</Link>
                      ) : (
                        <span key={c.label} aria-disabled="true" className={`${menuItem} justify-between pl-6 text-slate-tac`}>
                          {c.label} <span className="text-xs">Coming soon</span>
                        </span>
                      ),
                    )}
                  </div>
                )}
                {links.map((l) => (
                  <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className={`${menuItem} text-ivory`}>{l.label}</Link>
                ))}
                {session ? (
                  <button type="button" onClick={signOut} className={`${menuItem} text-slate-tac`}>Sign out</button>
                ) : (
                  <Link href="/auth/signin" onClick={() => setOpen(false)} className={`${menuItem} text-slate-tac sm:hidden`}>Sign in</Link>
                )}
                {demoSwitcher && <RoleSwitcher current={session?.role ?? null} busy={busy} onPick={switchRole} className="pt-2" />}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </header>
  );
}

function RoleSwitcher({ current, busy, onPick, className = "" }: { current: Role | null; busy: boolean; onPick: (r: Role) => void; className?: string }) {
  return (
    <div className={`items-center gap-2 ${className}`} role="group" aria-label="Demo role switcher">
      <span className="text-xs uppercase tracking-widest text-slate-tac">Demo as</span>
      <div className="flex rounded-full bg-obsidian/70 p-0.5">
        {(["PASSENGER", "OPERATOR", "PILOT"] as const).map((r) => (
          <button key={r} type="button" disabled={busy} onClick={() => onPick(r)} aria-pressed={current === r} className={`inline-flex items-center rounded-full px-3 py-1.5 text-xs transition pointer-coarse:min-h-11 ${current === r ? "bg-gold text-obsidian" : "text-slate-tac hover:text-ivory"}`}>
            {r === "PASSENGER" ? "Passenger" : r === "OPERATOR" ? "Operator" : "Pilot"}
          </button>
        ))}
      </div>
    </div>
  );
}
