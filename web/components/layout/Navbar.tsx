"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { EASE_LUXE } from "@/lib/animations";
import { ROLE_LABEL, type Role } from "@/lib/roles";

interface NavLink {
  href: string;
  label: string;
}

const PUBLIC_LINKS: NavLink[] = [
  { href: "/empty-legs", label: "Empty Legs" },
  { href: "/charter", label: "Charter" },
  { href: "/auth/signup?role=operator", label: "For Operators" },
  { href: "/auth/signup?role=pilot", label: "For Pilots" },
];

const LINKS: Record<Role, NavLink[]> = {
  PASSENGER: [
    { href: "/empty-legs", label: "Empty Legs" },
    { href: "/charter", label: "Charter" },
    { href: "/dashboard/bookings", label: "My Bookings" },
  ],
  OPERATOR: [
    { href: "/operator/dashboard", label: "Dashboard" },
    { href: "/operator/fleet", label: "Fleet" },
    { href: "/operator/crewing", label: "Crewing" },
    { href: "/operator/bench", label: "Bench" },
    { href: "/empty-legs", label: "Marketplace" },
  ],
  PILOT: [
    { href: "/wallet", label: "Credential Wallet" },
    { href: "/wallet/logbook", label: "Logbook" },
    { href: "/empty-legs", label: "Empty Legs" },
  ],
};

const CTA: Record<Role, NavLink> = {
  PASSENGER: { href: "/charter", label: "Request charter" },
  OPERATOR: { href: "/operator/empty-legs/new", label: "Publish empty leg" },
  PILOT: { href: "/wallet", label: "Check credentials" },
};

interface Props {
  session: { name: string; role: Role } | null;
  /** Shows the passwordless demo role switcher. Only true in non-production builds. */
  demoSwitcher: boolean;
}

export function Navbar({ session, demoSwitcher }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const links = session ? LINKS[session.role] : PUBLIC_LINKS;
  const cta = session ? CTA[session.role] : { href: "/auth/signup", label: "Get started" };

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
    router.push("/");
    router.refresh();
  }

  return (
    <header className="fixed inset-x-0 top-4 z-40 px-4">
      <div className="glass mx-auto max-w-7xl rounded-3xl bg-glass/80 shadow-lg shadow-black/30">
        <div className="flex h-14 items-center justify-between gap-4 pl-6 pr-3">
          <Link href="/" className="font-display text-2xl font-semibold tracking-wide text-gold-light">Lumiritin</Link>

          <nav aria-label="Main" className="hidden items-center gap-1 text-sm text-slate-tac lg:flex">
            {links.map((l) => {
              const on = pathname === l.href.split("?")[0];
              return (
                <Link key={l.href} href={l.href} aria-current={on ? "page" : undefined} className={`rounded-full px-3.5 py-1.5 transition hover:bg-white/5 hover:text-ivory ${on ? "bg-white/5 text-ivory" : ""}`}>
                  {l.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            {demoSwitcher && <RoleSwitcher current={session?.role ?? null} busy={busy} onPick={switchRole} className="hidden xl:flex" />}
            {session ? (
              <button type="button" onClick={signOut} disabled={busy} className="hidden px-3 py-1.5 text-sm text-slate-tac transition hover:text-ivory sm:block" title={`Signed in as ${session.name}`}>
                Sign out
              </button>
            ) : (
              <Link href="/auth/signin" className="hidden px-3 py-1.5 text-sm text-slate-tac transition hover:text-ivory sm:block">Sign in</Link>
            )}
            <Link href={cta.href} className="rounded-full bg-gold px-4 py-2 text-sm font-semibold text-obsidian transition hover:bg-gold-light">{cta.label}</Link>
            <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Menu" className="rounded-full p-2 text-ivory hover:bg-white/10 lg:hidden">
              <svg viewBox="0 0 24 24" className="h-6 w-6 fill-none stroke-current stroke-2" aria-hidden>{open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}</svg>
            </button>
          </div>
        </div>

        <AnimatePresence>
          {open && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1, transition: { duration: 0.3, ease: EASE_LUXE } }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden lg:hidden">
              <div className="space-y-1 border-t border-white/10 p-4">
                {session && <p className="px-3 pb-2 text-xs text-slate-tac">{session.name} · {ROLE_LABEL[session.role]}</p>}
                {links.map((l) => (
                  <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="block rounded-xl px-3 py-2.5 text-ivory hover:bg-white/5">{l.label}</Link>
                ))}
                {session ? (
                  <button type="button" onClick={signOut} className="block w-full rounded-xl px-3 py-2.5 text-left text-slate-tac hover:bg-white/5">Sign out</button>
                ) : (
                  <Link href="/auth/signin" onClick={() => setOpen(false)} className="block rounded-xl px-3 py-2.5 text-slate-tac hover:bg-white/5">Sign in</Link>
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
      <span className="text-[10px] uppercase tracking-widest text-slate-tac">Demo as</span>
      <div className="flex rounded-full bg-obsidian/70 p-0.5">
        {(["PASSENGER", "OPERATOR", "PILOT"] as const).map((r) => (
          <button key={r} type="button" disabled={busy} onClick={() => onPick(r)} aria-pressed={current === r} className={`rounded-full px-2.5 py-1 text-xs transition ${current === r ? "bg-gold text-obsidian" : "text-slate-tac hover:text-ivory"}`}>
            {r === "PASSENGER" ? "Passenger" : r === "OPERATOR" ? "Operator" : "Pilot"}
          </button>
        ))}
      </div>
    </div>
  );
}
