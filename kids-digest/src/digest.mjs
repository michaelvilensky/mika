// Daily job: gather WhatsApp group messages + school emails since the last
// digest, summarize with Claude, and send the result to you on WhatsApp.
//   npm run digest        — build and send
//   npm run digest:dry    — build and print only (doesn't advance the cursor)
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, loadConfig } from './config.mjs';
import { getMeta, messagesSince, setMeta } from './db.mjs';
import { fetchSchoolEmails } from './email.mjs';
import { summarize } from './summarize.mjs';
import { bridge } from './bridge-client.mjs';

const dryRun = process.argv.includes('--dry-run');
const config = loadConfig();
const now = Date.now();
const floor = now - config.maxLookbackHours * 3600_000;
const sinceTs = Math.max(Number(getMeta('last_digest_ts')) || now - 24 * 3600_000, floor);

console.log(`Collecting since ${new Date(sinceTs).toISOString()}`);
for (const g of config.groups.filter((g) => !g.jid)) {
  console.warn(`Group "${g.name}" isn't matched to a WhatsApp group — skipped (run npm run groups).`);
}
const groupMessages = config.groups
  .filter((g) => g.jid)
  .map((group) => ({ group, messages: messagesSince(group.jid, sinceTs) }));
const emails = await fetchSchoolEmails(config, sinceTs);
const waCount = groupMessages.reduce((n, g) => n + g.messages.length, 0);
console.log(`${waCount} WhatsApp messages, ${emails.length} emails`);

let text;
if (!waCount && !emails.length) {
  text = '📭 אין עדכונים חדשים מבית הספר ומהגן היום.';
} else {
  const result = await summarize(config, groupMessages, emails);
  text = result.text;
  console.log(`Summarized (${result.stats.images} images, ${result.stats.pdfs} PDFs; ` +
    `${result.usage.input_tokens} in / ${result.usage.output_tokens} out tokens)`);
}

const header = `*📋 סיכום יומי — ${new Date(now).toLocaleDateString('he-IL', { timeZone: config.timezone })}*\n\n`;
const message = header + text;

const archiveDir = path.join(DATA_DIR, 'digests');
fs.mkdirSync(archiveDir, { recursive: true });
fs.writeFileSync(path.join(archiveDir, `${new Date(now).toISOString().slice(0, 10)}${dryRun ? '-dry' : ''}.txt`), message);

if (dryRun) {
  console.log(`\n${message}`);
} else {
  await bridge('POST', '/send', { text: message });
  setMeta('last_digest_ts', now);
  console.log('Sent.');
}
