"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, type Tone } from "@/components/ui/Alert";
import { Pill } from "@/components/ui/Pill";
import { cardCls, dangerBtn, dangerTextBtn, ghostBtn, ghostBtnSm, primaryBtn } from "@/components/ui/Field";
import type { MfbStatus } from "@/lib/logbook-sync";
import { formatDateTime } from "./format";

const CONNECT_URL = "/api/logbook/connect/myflightbook";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

interface SyncBody {
  ok?: boolean;
  message?: string;
  created?: number;
  updated?: number;
  removed?: number;
  skipped?: number;
  empty?: boolean;
}

function syncNotice(d: SyncBody): { tone: Tone; text: string } {
  if (d.empty) return { tone: "warn", text: "MyFlightbook has no flights we can import yet. Add flights there and sync again." };
  const created = d.created ?? 0;
  const updated = d.updated ?? 0;
  const removed = d.removed ?? 0;
  const base = created + updated + removed === 0 ? "Already up to date" : `Synced: ${created} new, ${updated} updated, ${removed} removed`;
  return { tone: "ok", text: d.skipped ? `${base}, ${plural(d.skipped, "row")} skipped` : base };
}

/** Connect / sync / disconnect the pilot's MyFlightbook account. `live` is whether the site has MyFlightbook configured. */
export function MyFlightbookPanel({ live, mfb }: { live: boolean; mfb: MfbStatus | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"sync" | "disconnect" | null>(null);
  const [notice, setNotice] = useState<{ tone: Tone; text: string } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [removeFlights, setRemoveFlights] = useState(false);

  if (!live && !mfb) return <Alert tone="info">MyFlightbook connection is coming soon.</Alert>;

  async function sync() {
    setBusy("sync");
    setNotice(null);
    try {
      const res = await fetch(`${CONNECT_URL}/sync`, { method: "POST" });
      const d: SyncBody | null = await res.json().catch(() => null);
      if (!res.ok || !d?.ok) {
        // 409 (not connected / access expired) and 429 (slow down) are things the pilot can act on, not faults.
        setNotice({ tone: res.status === 409 || res.status === 429 ? "warn" : "err", text: d?.message ?? "Couldn't sync MyFlightbook. Please try again." });
        return;
      }
      setNotice(syncNotice(d));
      router.refresh();
    } catch {
      setNotice({ tone: "err", text: "Network error. Please try again." });
    } finally {
      setBusy(null);
    }
  }

  async function disconnect() {
    setBusy("disconnect");
    setNotice(null);
    try {
      const res = await fetch(CONNECT_URL, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ removeFlights }) });
      const d: (SyncBody & { removedFlights?: number }) | null = await res.json().catch(() => null);
      if (!res.ok || !d?.ok) {
        setNotice({ tone: "err", text: d?.message ?? "Couldn't disconnect MyFlightbook. Please try again." });
        return;
      }
      setConfirming(false);
      setRemoveFlights(false);
      setNotice({ tone: "ok", text: d.removedFlights ? `Disconnected from MyFlightbook. ${plural(d.removedFlights, "flight")} removed from your logbook.` : "Disconnected from MyFlightbook." });
      router.refresh();
    } catch {
      setNotice({ tone: "err", text: "Network error. Please try again." });
    } finally {
      setBusy(null);
    }
  }

  const noticeEl = notice && <Alert tone={notice.tone} className="mt-4">{notice.text}</Alert>;

  return (
    <section aria-labelledby="mfb-h" className={cardCls}>
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="mfb-h" className="font-display text-2xl text-ivory">{mfb ? "MyFlightbook" : "Connect MyFlightbook"}</h2>
        {mfb && <Pill tone="ok">Connected</Pill>}
      </div>

      {mfb ? (
        <>
          <p className="mt-2 text-sm text-ivory">
            {plural(mfb.flightCount, "flight")} imported · {mfb.lastSyncedAt ? `last synced ${formatDateTime(mfb.lastSyncedAt)}` : "not synced yet"}
          </p>
          {mfb.lastError && (
            <Alert tone="warn" className="mt-4">
              <p>
                {mfb.lastError}{" "}
                <a href={CONNECT_URL} className="font-semibold underline underline-offset-4">Reconnect</a>
              </p>
            </Alert>
          )}

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <button type="button" onClick={sync} disabled={busy !== null} className={primaryBtn}>{busy === "sync" ? "Syncing…" : "Sync now"}</button>
            <a href={CONNECT_URL} className={`${ghostBtn} text-center`}>Reconnect</a>
            <button type="button" onClick={() => setConfirming(true)} disabled={busy !== null || confirming} className={`${dangerTextBtn} justify-center sm:ml-auto`}>Disconnect</button>
          </div>

          {confirming && (
            <div role="group" aria-label="Confirm disconnect" className="mt-4 rounded-2xl bg-white/5 p-4">
              <p className="text-sm text-ivory">Disconnect MyFlightbook? Your flights stay in your logbook unless you choose to remove them.</p>
              {mfb.flightCount > 0 && (
                <label className="mt-3 flex min-h-11 cursor-pointer items-center gap-3 text-sm text-ivory">
                  <input type="checkbox" checked={removeFlights} onChange={(e) => setRemoveFlights(e.target.checked)} disabled={busy !== null} className="h-5 w-5 shrink-0 accent-gold" />
                  Also remove the {plural(mfb.flightCount, "flight")} imported from MyFlightbook
                </label>
              )}
              <div className="mt-3 flex flex-wrap gap-3">
                <button type="button" onClick={() => { setConfirming(false); setRemoveFlights(false); }} disabled={busy !== null} className={ghostBtnSm} autoFocus>Cancel</button>
                <button type="button" onClick={disconnect} disabled={busy !== null} className={dangerBtn}>{busy === "disconnect" ? "Disconnecting…" : "Confirm disconnect"}</button>
              </div>
            </div>
          )}
          {noticeEl}
        </>
      ) : (
        <>
          <p className="mt-2 text-sm text-slate-tac">
            Import your flights from MyFlightbook so your hours and recency are filled in for you. You approve access on MyFlightbook&apos;s own page; Lumiritin only reads your flights.
          </p>
          <div className="mt-4 flex flex-col sm:flex-row">
            <a href={CONNECT_URL} className={`${primaryBtn} text-center`}>Connect MyFlightbook</a>
          </div>
          {noticeEl}
        </>
      )}
    </section>
  );
}
