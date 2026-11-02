// Daily job: everything since the last digest.
//   npm run digest        — build and send
//   npm run digest:dry    — build and print only (doesn't advance the cursor)
import { loadConfig } from './config.mjs';
import { getMeta } from './db.mjs';
import { runDigest } from './run-digest.mjs';

const config = loadConfig();
const now = Date.now();
const floor = now - config.maxLookbackHours * 3600_000;
const sinceTs = Math.max(Number(getMeta('last_digest_ts')) || now - 24 * 3600_000, floor);
const date = new Date(now).toLocaleDateString('he-IL', { timeZone: config.timezone });

await runDigest({ sinceTs, title: `סיכום יומי — ${date}`, dryRun: process.argv.includes('--dry-run') });
