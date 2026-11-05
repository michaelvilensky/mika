// First-run catch-up: pull the last few days of WhatsApp + email and send one digest.
//   npm run init           — last 3 days
//   npm run init -- 5      — last 5 days (max 14)
//   npm run init -- 5 --dry-run
import { runDigest } from './run-digest.mjs';
import { bridge } from './bridge-client.mjs';

const ROUND_WAIT_MS = 10_000;
const MAX_ROUNDS = 8; // each round asks for 50 older messages per group
const days = Math.min(Math.max(Number(process.argv.find((a) => /^\d+$/.test(a))) || 3, 1), 14);
const dryRun = process.argv.includes('--dry-run');
const sinceTs = Date.now() - days * 86400_000;

console.log(`Asking your phone for the last ${days} days of the watched groups (keep WhatsApp open on the phone)...`);
let results = [];
for (let round = 1; round <= MAX_ROUNDS; round++) {
  results = await bridge('POST', '/backfill', { days });
  if (!results.some((r) => r.status === 'requested older messages')) break;
  console.log(`  round ${round}: waiting for older messages...`);
  await new Promise((resolve) => setTimeout(resolve, ROUND_WAIT_MS));
}
for (const r of results) console.log(`  ${r.group}: ${r.status}`);

await runDigest({ sinceTs, title: `סיכום פתיחה — ${days} הימים האחרונים`, dryRun });
