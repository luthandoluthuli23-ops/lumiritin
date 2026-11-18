/**
 * Deletes verification document images 90 days after a reviewer's decision (the submission, decision and audit log
 * are kept). Same as the /api/cron/document-retention route; run from cron/Task Scheduler if not on Vercel.
 */
import { db } from "../lib/db";
import { purgeExpiredDocuments } from "../lib/pilot-verification";

purgeExpiredDocuments()
  .then((r) => console.log(`Purged ${r.documents} document(s) from ${r.submissions} submission(s).`))
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
