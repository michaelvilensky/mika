import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = path.join(ROOT, 'data');
export const MEDIA_DIR = path.join(DATA_DIR, 'media');
export const AUTH_DIR = path.join(DATA_DIR, 'wa-auth');
// Written by the bridge: every group you're in, as [{ jid, name }].
export const KNOWN_GROUPS_FILE = path.join(DATA_DIR, 'groups.json');

for (const dir of [DATA_DIR, MEDIA_DIR]) fs.mkdirSync(dir, { recursive: true });

try {
  process.loadEnvFile(path.join(ROOT, '.env'));
} catch (err) {
  if (err.code !== 'ENOENT') throw err;
}

export const BRIDGE_PORT = Number(process.env.BRIDGE_PORT || 4873);
export const BRIDGE_TOKEN = process.env.BRIDGE_TOKEN || '';

export function loadConfig() {
  const file = path.join(ROOT, 'config.json');
  if (!fs.existsSync(file)) {
    throw new Error(`Missing ${file} — copy config.example.json to config.json and fill it in.`);
  }
  const config = JSON.parse(fs.readFileSync(file, 'utf8'));
  config.groups ??= [];
  config.kids ??= [];
  config.deliverTo ??= 'self';
  config.timezone ??= 'Asia/Jerusalem';
  config.maxLookbackHours ??= 72;
  config.email ??= {};
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

export function watchedGroupJids() {
  try {
    return new Set(loadConfig().groups.map((g) => g.jid).filter(Boolean));
  } catch {
    return new Set();
  }
}
