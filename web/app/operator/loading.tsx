import { cardCls } from "@/components/ui/Field";

/** Shown inside the operator layout (the tab strip stays put) while a portal page loads. */
export default function OperatorLoading() {
  return (
    <div role="status" className="space-y-8 motion-safe:animate-pulse sm:space-y-10">
      <span className="sr-only">Loading…</span>
      <div className="space-y-3">
        <div className="h-10 w-2/3 max-w-sm rounded-xl bg-white/10 sm:h-12" />
        <div className="h-5 w-full max-w-md rounded-lg bg-white/5" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`${cardCls} h-32`} />
        ))}
      </div>
      <div className={`${cardCls} h-48`} />
    </div>
  );
}
