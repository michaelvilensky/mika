// Evening reminder: re-sends the "✅ לפעולה" section of today's digest, if it had one.
//   npm run reminder            — send
//   npm run reminder -- --dry-run
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, loadConfig } from './config.mjs';
import { bridge } from './bridge-client.mjs';
import { REMINDER_PREFIX } from './guards.mjs';
import { notifyPhone } from './notify.mjs';

// Bullets between the "✅ לפעולה" heading and the next *heading*.
function actionItems(digest) {
  const lines = digest.split('\n');
  const start = lines.findIndex((l) => l.includes('✅') && l.includes('לפעולה'));
  if (start === -1) return [];
  const items = [];
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith('*')) break;
    if (line.trim()) items.push(line);
  }
  return items;
}

function todaysDigest(config) {
  const dir = path.join(DATA_DIR, 'digests');
  if (!fs.existsSync(dir)) return null;
  const day = (ms) => new Date(ms).toLocaleDateString('sv-SE', { timeZone: config.timezone });
  const today = day(Date.now());
  const file = fs.readdirSync(dir)
    .filter((f) => f.endsWith('.txt') && !f.endsWith('-dry.txt'))
    .map((f) => path.join(dir, f))
    .filter((f) => day(fs.statSync(f).mtimeMs) === today)
    .sort()
    .at(-1);
  return file ? fs.readFileSync(file, 'utf8') : null;
}

const config = loadConfig();
const digest = todaysDigest(config);
const items = digest ? actionItems(digest) : [];
if (!items.length) {
  console.log(`${new Date().toISOString()} No action items in today's digest — no reminder.`);
  process.exit(0);
}

const message = `${REMINDER_PREFIX} תזכורת — לפעולה*\n\n${items.join('\n')}`;
if (process.argv.includes('--dry-run')) {
  console.log(message);
} else {
  await bridge('POST', '/send', { text: message });
  await notifyPhone('⏰ תזכורת לפעולה בקבוצת Kids Digest');
  console.log(`${new Date().toISOString()} Sent reminder (${items.length} lines).`);
}
