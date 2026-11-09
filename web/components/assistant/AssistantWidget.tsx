"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { safeNextPath, type Role } from "@/lib/roles";

interface Msg {
  id: number;
  role: "user" | "assistant";
  content: string;
  action?: { href: string; label: string } | null;
  /** A failure notice. Shown to the visitor but never sent back to the model. */
  error?: boolean;
}

const STORE_KEY = "lum_assistant_v1";
const MAX_STORED = 30;
const MAX_INPUT = 600;

const SUGGESTIONS: Record<Role | "guest", string[]> = {
  guest: ["How do empty legs work?", "Take me to the charter page", "What does a CPL involve?", "I'm a pilot. How do I get started?"],
  PASSENGER: ["Find me an empty leg deal", "Help me plan a charter", "How do I check my booking?"],
  PILOT: ["How do I import my logbook?", "How do I add my licence?", "What is my reputation score?"],
  OPERATOR: ["Post a crew request", "Publish an empty leg", "How does the bench work?"],
};

const isNarrow = () => typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches;
const isTouch = () => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;

function loadStored(): Msg[] {
  try {
    const raw = sessionStorage.getItem(STORE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((m): m is Msg => !!m && typeof m === "object" && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && typeof m.id === "number")
      .slice(-MAX_STORED);
  } catch {
    return [];
  }
}
function saveStored(msgs: Msg[]) {
  try {
    sessionStorage.setItem(STORE_KEY, JSON.stringify(msgs.slice(-MAX_STORED)));
  } catch {
    /* private mode / blocked storage: the chat still works, it just isn't remembered */
  }
}

/** The site-wide "Ask Lumi" chat. Lives in the root layout, so the conversation survives page changes. */
export function AssistantWidget({ role }: { role: Role | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [vv, setVv] = useState<{ height: number; top: number } | null>(null);
  const idRef = useRef(1);
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const msgsRef = useRef<Msg[]>([]);
  msgsRef.current = msgs;

  // Restore after hydration (sessionStorage doesn't exist on the server).
  useEffect(() => {
    const stored = loadStored();
    if (stored.length) {
      setMsgs(stored);
      idRef.current = Math.max(...stored.map((m) => m.id)) + 1;
    }
  }, []);
  useEffect(() => {
    if (msgs.length) saveStored(msgs);
  }, [msgs]);

  // Keep the newest message in view.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs, busy, open]);

  // While open: Escape closes; on phones the page behind doesn't scroll, and the panel tracks the visible area so the
  // on-screen keyboard never covers the input.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    const narrow = isNarrow();
    if (narrow) document.body.style.overflow = "hidden";
    const v = window.visualViewport;
    const onResize = () => setVv(v && isNarrow() ? { height: v.height, top: v.offsetTop } : null);
    onResize();
    v?.addEventListener("resize", onResize);
    v?.addEventListener("scroll", onResize);
    inputRef.current?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      v?.removeEventListener("resize", onResize);
      v?.removeEventListener("scroll", onResize);
      setVv(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => () => abortRef.current?.abort(), []);

  function close() {
    setOpen(false);
  }
  // Hand focus back to the launcher once it has re-mounted after the panel closes.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !open) launcherRef.current?.focus({ preventScroll: true });
    wasOpen.current = open;
  }, [open]);

  const send = useCallback(
    async (raw: string) => {
      const content = raw.trim().slice(0, MAX_INPUT);
      if (!content || busy) return;
      const userMsg: Msg = { id: idRef.current++, role: "user", content };
      const history = [...msgsRef.current.filter((m) => !m.error), userMsg].map((m) => ({ role: m.role, content: m.content }));
      setMsgs((prev) => [...prev, userMsg]);
      setText("");
      setBusy(true);
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const res = await fetch("/api/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: history }),
          signal: ctrl.signal,
        });
        const data = (await res.json().catch(() => ({}))) as { reply?: string; message?: string; action?: { href?: string; label?: string } | null };
        if (!res.ok || !data.reply) {
          setMsgs((prev) => [...prev, { id: idRef.current++, role: "assistant", content: data.message ?? "Something went wrong. Please try again.", error: true }]);
          return;
        }
        // Only same-site relative links are ever followed, whatever the server sent.
        const href = data.action?.href ? safeNextPath(data.action.href) : null;
        const action = href && data.action?.label ? { href, label: String(data.action.label).slice(0, 60) } : null;
        setMsgs((prev) => [...prev, { id: idRef.current++, role: "assistant", content: data.reply as string, action }]);
        if (action) {
          router.push(action.href);
          // On a phone the chat covers the whole screen, so step aside to show the page it opened.
          if (isNarrow()) window.setTimeout(() => setOpen(false), 1400);
        }
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setMsgs((prev) => [...prev, { id: idRef.current++, role: "assistant", content: "I couldn't reach the server. Check your connection and try again.", error: true }]);
      } finally {
        setBusy(false);
      }
    },
    [busy, router],
  );

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void send(text);
  }
  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends with a keyboard; on touch screens Enter is a new line (the Send button sends).
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && !isTouch()) {
      e.preventDefault();
      void send(text);
    }
  }
  function reset() {
    abortRef.current?.abort();
    setBusy(false);
    setMsgs([]);
    try {
      sessionStorage.removeItem(STORE_KEY);
    } catch {
      /* ignore */
    }
    inputRef.current?.focus({ preventScroll: true });
  }

  const chips = SUGGESTIONS[role ?? "guest"];
  const panelStyle = vv ? { height: vv.height, top: vv.top } : undefined;

  return (
    <div className="print:hidden">
      {!open && (
        <button
          ref={launcherRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Ask Lumi: open the assistant"
          className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-[max(1rem,env(safe-area-inset-right))] z-40 inline-flex min-h-14 items-center gap-2 rounded-full bg-gold px-4 text-sm font-semibold text-obsidian shadow-gold transition hover:bg-gold-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-light"
        >
          <svg aria-hidden viewBox="0 0 24 24" className="h-6 w-6 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.4A8 8 0 1 1 21 12Z" />
            <path d="M9 11h6M9 14h3.5" />
          </svg>
          <span className="max-sm:hidden">Ask Lumi</span>
        </button>
      )}

      {open && (
        <section
          role="dialog"
          aria-label="Ask Lumi"
          style={panelStyle}
          className="fixed inset-x-0 bottom-0 z-50 flex h-dvh flex-col overflow-hidden border-white/10 bg-obsidian-800 shadow-2xl sm:inset-x-auto sm:bottom-[max(1.5rem,env(safe-area-inset-bottom))] sm:right-6 sm:h-[min(36rem,calc(100dvh-3rem))] sm:w-[24rem] sm:rounded-3xl sm:border"
        >
          <header className="flex items-center gap-3 border-b border-white/10 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-xl leading-tight text-gold-light">Ask Lumi</h2>
              <p className="truncate text-xs text-slate-tac">Flying questions and site help</p>
            </div>
            {msgs.length > 0 && (
              <button type="button" onClick={reset} className="inline-flex items-center rounded-full px-3 py-1.5 text-xs text-slate-tac transition hover:text-ivory pointer-coarse:min-h-11">
                New chat
              </button>
            )}
            <button
              type="button"
              onClick={close}
              aria-label="Close the assistant"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-tac transition hover:bg-white/5 hover:text-ivory pointer-coarse:h-11 pointer-coarse:w-11"
            >
              <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </header>

          <div ref={listRef} role="log" aria-live="polite" aria-label="Conversation" className="flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-4">
            {msgs.length === 0 && (
              <div>
                <p className="text-sm text-ivory">Hi, I&apos;m Lumi. Ask me anything about flying, or tell me what you&apos;d like to do on the site and I&apos;ll take you there.</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {chips.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => void send(c)}
                      className="rounded-full border border-white/15 px-3.5 py-2 text-left text-sm text-ivory transition hover:border-gold/60 pointer-coarse:min-h-11"
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {msgs.map((m) => (
              <div key={m.id} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div className={`max-w-[88%] ${m.role === "user" ? "" : "space-y-2"}`}>
                  <p
                    className={`whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                      m.role === "user" ? "bg-gold text-obsidian" : m.error ? "border border-alert/40 bg-alert/10 text-ivory" : "bg-white/5 text-ivory"
                    }`}
                  >
                    {m.content}
                  </p>
                  {m.action && (
                    <Link
                      href={m.action.href}
                      onClick={() => isNarrow() && setOpen(false)}
                      className="inline-flex items-center gap-1 rounded-full border border-gold/50 px-3.5 py-2 text-sm font-semibold text-gold-light transition hover:bg-gold/10 pointer-coarse:min-h-11"
                    >
                      {m.action.label} <span aria-hidden>→</span>
                    </Link>
                  )}
                </div>
              </div>
            ))}

            {busy && (
              <div className="flex justify-start" role="status">
                <p className="rounded-2xl bg-white/5 px-3.5 py-2.5 text-sm text-slate-tac">
                  Lumi is thinking<span className="motion-safe:animate-pulse">…</span>
                </p>
              </div>
            )}
          </div>

          <form onSubmit={onSubmit} className="border-t border-white/10 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
            <div className="flex items-end gap-2">
              <label className="sr-only" htmlFor="lumi-chat-input">
                Message Lumi
              </label>
              <textarea
                id="lumi-chat-input"
                ref={inputRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={onKeyDown}
                rows={1}
                maxLength={MAX_INPUT}
                placeholder="Ask about flying or the site…"
                className="max-h-32 min-h-11 w-full resize-none rounded-2xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-base text-ivory outline-none transition placeholder:text-slate-tac/60 focus:border-gold/60 sm:text-sm"
              />
              <button
                type="submit"
                disabled={busy || !text.trim()}
                className="inline-flex h-11 shrink-0 items-center justify-center rounded-full bg-gold px-4 text-sm font-semibold text-obsidian transition hover:bg-gold-light disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-light"
              >
                Send
              </button>
            </div>
            <p className="mt-2 text-center text-[11px] leading-snug text-slate-tac">Lumi can make mistakes. For flight safety, use official sources and your aircraft&apos;s manual.</p>
          </form>
        </section>
      )}
    </div>
  );
}
