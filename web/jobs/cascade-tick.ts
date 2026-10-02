// Moves every dispatched, still-open crew request along: expires pings older than 10 minutes and pings the
// next-ranked pilot. Run every minute from cron (or Task Scheduler / a GitHub Actions schedule):
//   npm run job:cascade
// Without it the cascade still advances whenever an operator's status page is open or a pilot responds,
// but a request nobody is watching would sit until then.
import { advanceCascade, openDispatchedRequestIds } from "../lib/cascade";
import { db } from "../lib/db";

async function main() {
  const ids = await openDispatchedRequestIds();
  let expired = 0;
  let pinged = 0;
  for (const id of ids) {
    const r = await advanceCascade(id);
    expired += r.expired;
    pinged += r.newlyPinged;
  }
  console.log(`cascade tick: ${ids.length} open request(s), ${expired} ping(s) expired, ${pinged} new ping(s) sent`);
}

main().finally(() => db.$disconnect());
