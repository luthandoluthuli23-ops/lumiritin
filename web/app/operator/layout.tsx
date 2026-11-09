import type { ReactNode } from "react";
import { OperatorNav } from "@/components/operator/OperatorNav";
import { requireOperator } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function OperatorLayout({ children }: { children: ReactNode }) {
  const operator = await requireOperator();
  return (
    <>
      <OperatorNav operatorName={operator.operatorName} isPrivate={operator.isPrivate} />
      {/* Same width as the navbar and footer (max-w-7xl) because the portal's tiles and tables use the extra room. */}
      <main className="px-4 pb-24 pt-8 sm:px-6 sm:pt-10">
        <div className="mx-auto max-w-7xl px-safe">{children}</div>
      </main>
    </>
  );
}
