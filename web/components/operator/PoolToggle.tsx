import { ghostBtnSm, primaryBtnSm } from "@/components/ui/Field";

/** Offer a rostered pilot to the shared pool (or take them back). One control for the pilots and bench pages. */
export function PoolToggle({ shared, busy, onToggle }: { shared: boolean; busy: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} disabled={busy} aria-pressed={shared} className={`${shared ? primaryBtnSm : ghostBtnSm} gap-1.5`}>
      {shared && (
        <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-[2.5]">
          <path d="m5 13 4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      {shared ? "Shared to pool" : "Offer to shared pool"}
    </button>
  );
}
