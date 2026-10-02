// Re-imports every connected pilot's external calendar so blocked days stay current. Run e.g. every 30 minutes:
//   npm run job:calendar
import { syncFromSavedUrl } from "../lib/calendar-sync";
import { db } from "../lib/db";

async function main() {
  const pilots = await db.person.findMany({ where: { icalUrl: { not: null } }, select: { id: true } });
  let ok = 0;
  let failed = 0;
  for (const p of pilots) {
    const r = await syncFromSavedUrl(p.id);
    if ("error" in r) failed++;
    else ok++;
  }
  console.log(`calendar sync: ${pilots.length} feed(s), ${ok} ok, ${failed} failed`);
}

main().finally(() => db.$disconnect());
