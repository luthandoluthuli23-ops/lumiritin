import type { ReactNode } from "react";
import { OperatorNav } from "@/components/operator/OperatorNav";
import { requireOperator } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function OperatorLayout({ children }: { children: ReactNode }) {
  const operator = await requireOperator();
  return (
    <>
      <OperatorNav operatorName={operator.operatorName} />
      <main className="px-6 py-10">
        <div className="mx-auto max-w-7xl">{children}</div>
      </main>
    </>
  );
}
