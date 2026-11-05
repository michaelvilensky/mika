import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = path.join(ROOT, 'data');
export const MEDIA_DIR = path.join(DATA_DIR, 'media');
export const AUTH_DIR = path.join(DATA_DIR, 'wa-auth');
export const EMAIL_FILES_DIR = path.join(DATA_DIR, 'email-files');
// Written by the bridge: every group you're in, as [{ jid, name }].
export const KNOWN_GROUPS_FILE = path.join(DATA_DIR, 'groups.json');

// Everything this process creates (WhatsApp session keys, messages, media, logs) is readable only by you.
process.umask(0o077);
for (const dir of [DATA_DIR, MEDIA_DIR]) fs.mkdirSync(dir, { recursive: true });
fs.chmodSync(DATA_DIR, 0o700);

const ENV_FILE = path.join(ROOT, '.env');
if (fs.existsSync(ENV_FILE)) {
  fs.chmodSync(ENV_FILE, 0o600);
  process.loadEnvFile(ENV_FILE);
}

export const BRIDGE_PORT = Number(process.env.BRIDGE_PORT || 4873);
export const BRIDGE_TOKEN = process.env.BRIDGE_TOKEN || '';

const CONFIG_FILE = path.join(ROOT, 'config.json');

export function readRawConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    throw new Error(`Missing ${CONFIG_FILE} — copy config.example.json to config.json and fill it in.`);
  }
  return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
}

// Keeps a timestamped backup in data/config-backups, then replaces config.json atomically.
export function writeRawConfig(raw) {
  const backups = path.join(DATA_DIR, 'config-backups');
  fs.mkdirSync(backups, { recursive: true });
  fs.copyFileSync(CONFIG_FILE, path.join(backups, `${new Date().toISOString().replace(/:/g, '-')}.json`));
  const tmp = `${CONFIG_FILE}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(raw, null, 2)}\n`);
  fs.renameSync(tmp, CONFIG_FILE);
}

export function loadConfig() {
  const config = readRawConfig();
  config.groups ??= [];
  config.kids ??= [];
  config.deliverTo ??= 'self';
  config.timezone ??= 'Asia/Jerusalem';
  config.maxLookbackHours ??= 72;
  config.email ??= {};
  config.assistant = { enabled: true, allowedNumbers: [], ...config.assistant };
  config.groups = resolveGroups(config.groups, knownGroups());
  return config;
}

export function knownGroups() {
  try {
    return JSON.parse(fs.readFileSync(KNOWN_GROUPS_FILE, 'utf8'));
  } catch {
    return [];
  }
}

// Ignore quote-mark variants (" ״ ' ׳), dashes and spacing, so names typed by hand still match.
export function normalizeName(name) {
  return (name || '').replace(/["״'׳`\-–—_.,]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

// Fill in each configured group's jid by matching its name against the groups you're in.
export function resolveGroups(groups, known) {
  return groups.map((g) => {
    if (g.jid) return g;
    const target = normalizeName(g.name);
    const exact = known.filter((k) => normalizeName(k.name) === target);
    const loose = exact.length ? exact : known.filter((k) => normalizeName(k.name).includes(target));
    return loose.length === 1 ? { ...g, jid: loose[0].jid } : { ...g, jid: null, candidates: loose.map((k) => k.name) };
  });
}

// Stored media paths may come from another machine (e.g. the Mac before the move); look files up by name.
export function mediaFile(storedPath) {
  return storedPath ? path.join(MEDIA_DIR, path.basename(storedPath)) : null;
}

export function watchedGroupJids() {
  try {
    return new Set(loadConfig().groups.map((g) => g.jid).filter(Boolean));
  } catch {
    return new Set();
  }
}

// The Kids Digest group's jid, from the saved group list (no WhatsApp call).
export function deliveryGroupJid(config) {
  const { deliverTo } = config;
  if (deliverTo === 'self') return null;
  if (deliverTo.endsWith('@g.us')) return deliverTo;
  return resolveGroups([{ name: deliverTo }], knownGroups())[0].jid;
}
