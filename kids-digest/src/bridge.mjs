// Long-running WhatsApp linked-device bridge.
// Stores messages from the groups listed in config.json, and exposes a
// localhost-only HTTP API so the digest job can list groups and send to you.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import makeWASocket, {
  Browsers,
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  getContentType,
  jidNormalizedUser,
  normalizeMessageContent,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import {
  AUTH_DIR, BRIDGE_PORT, BRIDGE_TOKEN, KNOWN_GROUPS_FILE, MEDIA_DIR,
  knownGroups, loadConfig, resolveGroups, watchedGroupJids,
} from './config.mjs';
import { saveMessage } from './db.mjs';

const logger = pino({ level: process.env.LOG_LEVEL || 'warn' });
let sock = null;

function extractText(content) {
  if (!content) return null;
  const type = getContentType(content);
  const m = content[type];
  switch (type) {
    case 'conversation':
      return content.conversation;
    case 'extendedTextMessage':
      return m.text;
    case 'imageMessage':
    case 'videoMessage':
      return m.caption || `[${type === 'imageMessage' ? 'תמונה' : 'וידאו'}]`;
    case 'documentMessage':
      return [`[מסמך: ${m.fileName || 'ללא שם'}]`, m.caption].filter(Boolean).join(' ');
    case 'audioMessage':
      return '[הודעה קולית]';
    case 'pollCreationMessage':
    case 'pollCreationMessageV2':
    case 'pollCreationMessageV3':
      return `[סקר] ${m.name}: ${(m.options || []).map((o) => o.optionName).join(' / ')}`;
    case 'eventMessage':
      return `[אירוע] ${m.name || ''} ${m.description || ''}`.trim();
    case 'contactMessage':
      return `[איש קשר: ${m.displayName}]`;
    case 'locationMessage':
      return `[מיקום: ${m.name || m.address || ''}]`;
    default:
      return null; // reactions, protocol messages, stickers, etc.
  }
}

async function saveMedia(msg, content) {
  const type = getContentType(content);
  const isImage = type === 'imageMessage';
  const isPdf = type === 'documentMessage' && content.documentMessage.mimetype === 'application/pdf';
  if (!isImage && !isPdf) return {};
  try {
    const buffer = await downloadMediaMessage(msg, 'buffer', {}, { logger, reuploadRequest: sock.updateMediaMessage });
    const ext = isImage ? 'jpg' : 'pdf';
    const file = path.join(MEDIA_DIR, `${msg.key.id.replace(/[^\w-]/g, '_')}.${ext}`);
    fs.writeFileSync(file, buffer);
    return { mediaPath: file, mediaType: isImage ? 'image/jpeg' : 'application/pdf' };
  } catch (err) {
    logger.warn({ err: err.message, id: msg.key.id }, 'media download failed');
    return {};
  }
}

async function handleMessages(messages) {
  const watched = watchedGroupJids();
  for (const msg of messages) {
    const chatJid = msg.key?.remoteJid;
    if (!chatJid || !watched.has(chatJid) || !msg.message) continue;
    const content = normalizeMessageContent(msg.message);
    const text = extractText(content);
    if (text == null) continue;
    const media = await saveMedia(msg, content);
    saveMessage({
      id: `${chatJid}:${msg.key.id}`,
      chatJid,
      sender: msg.key.fromMe ? 'אני' : msg.pushName || (msg.key.participant || '').split('@')[0],
      ts: Number(msg.messageTimestamp) * 1000,
      text,
      ...media,
    });
  }
}

async function refreshGroups() {
  const groups = Object.values(await sock.groupFetchAllParticipating()).map((g) => ({ jid: g.id, name: g.subject }));
  fs.writeFileSync(KNOWN_GROUPS_FILE, JSON.stringify(groups, null, 2));
  try {
    for (const g of loadConfig().groups) {
      if (g.jid) console.log(`Watching: ${g.name}`);
      else if (g.candidates?.length) console.warn(`"${g.name}" matches several groups: ${g.candidates.join(' | ')} — make the name more specific`);
      else console.warn(`"${g.name}" not found among your WhatsApp groups — check the name (npm run groups)`);
    }
  } catch (err) {
    console.warn(err.message);
  }
}

async function connect() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();
  sock = makeWASocket({
    version,
    auth: state,
    logger,
    browser: Browsers.macOS('Kids Digest'),
    // Stay "offline" so your phone keeps showing notifications.
    markOnlineOnConnect: false,
    syncFullHistory: false,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      console.log('\nScan this QR in WhatsApp → Settings → Linked devices → Link a device:\n');
      qrcode.generate(qr, { small: true });
    }
    if (connection === 'open') {
      console.log(`WhatsApp connected as ${sock.user?.id}`);
      refreshGroups().catch((e) => logger.error(e));
    }
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code === DisconnectReason.loggedOut) {
        console.error('Logged out from WhatsApp. Delete data/wa-auth and run `npm run bridge` to re-link.');
        process.exit(1);
      }
      console.warn(`Connection closed (${code}); reconnecting in 5s`);
      setTimeout(connect, 5000);
    }
  });

  sock.ev.on('messages.upsert', ({ messages }) => handleMessages(messages).catch((e) => logger.error(e)));
  sock.ev.on('messaging-history.set', ({ messages }) => handleMessages(messages).catch((e) => logger.error(e)));
  // Joined a group or a group was renamed.
  sock.ev.on('groups.upsert', () => refreshGroups().catch((e) => logger.error(e)));
  sock.ev.on('groups.update', () => refreshGroups().catch((e) => logger.error(e)));
}

function deliveryJid() {
  const { deliverTo } = loadConfig();
  if (deliverTo === 'self') return jidNormalizedUser(sock.user.id);
  if (deliverTo.endsWith('@g.us')) return deliverTo;
  // A group name: resolve it the same way as the watched groups.
  const [resolved] = resolveGroups([{ name: deliverTo }], knownGroups());
  if (!resolved.jid) throw new Error(`deliverTo group "${deliverTo}" not found (or ambiguous)`);
  return resolved.jid;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch (e) {
        reject(e);
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const reply = (status, obj) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(obj));
  };
  if (!BRIDGE_TOKEN || req.headers.authorization !== `Bearer ${BRIDGE_TOKEN}`) return reply(401, { error: 'unauthorized' });
  if (!sock?.user) return reply(503, { error: 'WhatsApp not connected yet' });
  try {
    if (req.method === 'GET' && req.url === '/groups') {
      const groups = await sock.groupFetchAllParticipating();
      return reply(200, Object.values(groups).map((g) => ({ jid: g.id, name: g.subject, size: g.participants?.length })));
    }
    if (req.method === 'POST' && req.url === '/send') {
      const { text } = await readJson(req);
      if (!text) return reply(400, { error: 'text required' });
      await sock.sendMessage(deliveryJid(), { text });
      return reply(200, { ok: true });
    }
    reply(404, { error: 'not found' });
  } catch (err) {
    logger.error(err);
    reply(500, { error: err.message });
  }
});

if (!BRIDGE_TOKEN) {
  console.error('BRIDGE_TOKEN is not set in .env — see .env.example.');
  process.exit(1);
}
server.listen(BRIDGE_PORT, '127.0.0.1', () => console.log(`Bridge API on http://127.0.0.1:${BRIDGE_PORT}`));
connect();
