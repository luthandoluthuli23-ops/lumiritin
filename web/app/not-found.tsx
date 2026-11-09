import Link from "next/link";
import { ghostBtn, pageCls, primaryBtn } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";

export default function NotFound() {
  return (
    <main className={`${pageCls} max-w-xl`}>
      <PageHeader eyebrow="Error 404" title="Off the chart" subtitle="We can't find that page. It may have moved, or the link may be wrong." />
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/" className={`${primaryBtn} inline-flex items-center justify-center`}>
          Back to home
        </Link>
        <Link href="/charter" className={`${ghostBtn} inline-flex items-center justify-center`}>
          Plan a charter
        </Link>
      </div>
    </main>
  );
}
