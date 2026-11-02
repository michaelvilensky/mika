import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = path.join(ROOT, 'data');
export const MEDIA_DIR = path.join(DATA_DIR, 'media');
export const AUTH_DIR = path.join(DATA_DIR, 'wa-auth');

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
  return config;
}

export function watchedGroupJids() {
  try {
    return new Set(loadConfig().groups.map((g) => g.jid));
  } catch {
    return new Set();
  }
}
