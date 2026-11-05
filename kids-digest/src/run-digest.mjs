// Gather WhatsApp group messages + school emails since `sinceTs`, summarize
// with Claude, send to the Kids Digest group and ping your phone.
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, loadConfig } from './config.mjs';
import { messagesSince, setMeta } from './db.mjs';
import { fetchSchoolEmails } from './email.mjs';
import { summarize } from './summarize.mjs';
import { bridge } from './bridge-client.mjs';
import { notifyPhone } from './notify.mjs';

const LOCK_FILE = path.join(DATA_DIR, 'digest.lock');
const STALE_LOCK_MS = 15 * 60 * 1000;

// One digest at a time (the schedule and "שלח סיכום עכשיו" could overlap).
function acquireLock() {
  try {
    if (Date.now() - fs.statSync(LOCK_FILE).mtimeMs < STALE_LOCK_MS) throw new Error('Another digest is already running.');
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  fs.writeFileSync(LOCK_FILE, String(process.pid));
}

export async function runDigest(options) {
  acquireLock();
  try {
    await buildAndSend(options);
  } finally {
    fs.rmSync(LOCK_FILE, { force: true });
  }
}

async function buildAndSend({ sinceTs, title, dryRun = false }) {
  const config = loadConfig();
  const now = Date.now();

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
    text = '📭 אין עדכונים חדשים מבית הספר ומהגן.';
  } else {
    const result = await summarize(config, groupMessages, emails);
    text = result.text;
    console.log(`Summarized (${result.stats.images} images, ${result.stats.pdfs} PDFs; ` +
      `${result.usage.input_tokens} in / ${result.usage.output_tokens} out tokens)`);
  }

  const message = `*📋 ${title}*\n\n${text}`;
  const archiveDir = path.join(DATA_DIR, 'digests');
  fs.mkdirSync(archiveDir, { recursive: true });
  fs.writeFileSync(path.join(archiveDir, `${new Date(now).toISOString().replace(/:/g, '-')}${dryRun ? '-dry' : ''}.txt`), message);

  if (dryRun) {
    console.log(`\n${message}`);
    return;
  }
  await bridge('POST', '/send', { text: message });
  setMeta('last_digest_ts', now);
  await notifyPhone('📋 הסיכום מוכן בקבוצת Kids Digest');
  console.log('Sent.');
}
