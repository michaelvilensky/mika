import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { DATA_DIR } from './config.mjs';

const db = new DatabaseSync(path.join(DATA_DIR, 'digest.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id         TEXT PRIMARY KEY,
    chat_jid   TEXT NOT NULL,
    wa_id      TEXT,
    from_me    INTEGER,
    sender     TEXT,
    ts         INTEGER NOT NULL,
    text       TEXT,
    media_path TEXT,
    media_type TEXT
  );
  CREATE INDEX IF NOT EXISTS messages_chat_ts ON messages (chat_jid, ts);
  CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
`);

const insert = db.prepare(`
  INSERT OR IGNORE INTO messages (id, chat_jid, wa_id, from_me, sender, ts, text, media_path, media_type)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

export function saveMessage(m) {
  insert.run(
    `${m.chatJid}:${m.waId}`, m.chatJid, m.waId, m.fromMe ? 1 : 0, m.sender ?? null, m.ts,
    m.text ?? null, m.mediaPath ?? null, m.mediaType ?? null,
  );
}

export function messagesSince(chatJid, sinceTs) {
  return db
    .prepare('SELECT * FROM messages WHERE chat_jid = ? AND ts >= ? ORDER BY ts')
    .all(chatJid, sinceTs);
}

export function oldestMessage(chatJid) {
  return db.prepare('SELECT * FROM messages WHERE chat_jid = ? ORDER BY ts LIMIT 1').get(chatJid) ?? null;
}

export function getMeta(key) {
  return db.prepare('SELECT value FROM meta WHERE key = ?').get(key)?.value ?? null;
}

export function setMeta(key, value) {
  db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, String(value));
}
