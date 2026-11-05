// Long-running WhatsApp linked-device bridge.
// Stores messages from the groups listed in config.json, answers your requests in
// the Kids Digest group (assistant.mjs), and exposes a localhost-only HTTP API so
// the digest job can list groups and send to you.
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
  fetchLatestWaWebVersion,
  getContentType,
  jidNormalizedUser,
  normalizeMessageContent,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import {
  AUTH_DIR, BRIDGE_PORT, BRIDGE_TOKEN, DATA_DIR, KNOWN_GROUPS_FILE, MEDIA_DIR,
  deliveryGroupJid, knownGroups, loadConfig, resolveGroups, watchedGroupJids,
} from './config.mjs';
import { getMeta, oldestMessage, saveMessage, setMeta } from './db.mjs';
import {
  BOT_PREFIX, MAX_QUEUED_REQUESTS, MAX_REPLIES_PER_DAY, MAX_REQUEST_CHARS, checkDailyLimit, checkDeliveryGroup,
  checkRequestBudget, checkText, isAuthorizedSender, isRequestCandidate, killSwitchCommand, phoneDigits,
} from './guards.mjs';
import { handleRequest, startEmailRefresh } from './assistant.mjs';

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

// live: arrived just now (not history sync) — only these can be requests to the assistant.
async function handleMessages(messages, live) {
  const watched = watchedGroupJids();
  for (const msg of messages) {
    const chatJid = msg.key?.remoteJid;
    if (live && chatJid && msg.message) maybeQueueRequest(msg);
    if (!chatJid || !watched.has(chatJid) || !msg.message) continue;
    const content = normalizeMessageContent(msg.message);
    const text = extractText(content);
    if (text == null) continue;
    const media = await saveMedia(msg, content);
    saveMessage({
      chatJid,
      waId: msg.key.id,
      fromMe: msg.key.fromMe,
      sender: msg.key.fromMe ? 'אני' : msg.pushName || (msg.key.participant || '').split('@')[0],
      ts: Number(msg.messageTimestamp) * 1000,
      text,
      ...media,
    });
  }
}

// Group events arrive in bursts; one fetch per burst avoids WhatsApp's rate-overlimit.
const GROUP_REFRESH_MIN_MS = 5 * 60 * 1000;
let lastGroupRefresh = 0;
let groupRefreshTimer = null;

function scheduleGroupRefresh() {
  if (groupRefreshTimer) return;
  const wait = Math.max(0, lastGroupRefresh + GROUP_REFRESH_MIN_MS - Date.now());
  groupRefreshTimer = setTimeout(() => {
    groupRefreshTimer = null;
    refreshGroups().catch((e) => logger.error(e));
  }, wait);
}

async function refreshGroups() {
  lastGroupRefresh = Date.now();
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
  // Baileys' own version list lags; WhatsApp refuses to link outdated clients.
  const web = await fetchLatestWaWebVersion().catch(() => null);
  const { version } = web?.isLatest ? web : await fetchLatestBaileysVersion();
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
      refreshGroups().catch((e) => {
        logger.error(e);
        scheduleGroupRefresh();
      });
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

  sock.ev.on('messages.upsert', ({ messages }) => handleMessages(messages, true).catch((e) => logger.error(e)));
  sock.ev.on('messaging-history.set', ({ messages }) => handleMessages(messages, false).catch((e) => logger.error(e)));
  // Joined a group or a group was renamed.
  sock.ev.on('groups.upsert', scheduleGroupRefresh);
  sock.ev.on('groups.update', scheduleGroupRefresh);
}

// sendDigest and sendReply are the only places the bridge sends a message; rules live in guards.mjs.
const SENT_LOG = path.join(DATA_DIR, 'logs', 'sent.log');
const ASSISTANT_LOG = path.join(DATA_DIR, 'logs', 'assistant.log');
// Ids of messages we sent; they come back to us as fromMe and must never be read as requests.
const ownSends = new Set();
const GROUP_META_TTL_MS = 10 * 60 * 1000;
let groupMetaCache = null;

function today(config) {
  return new Date().toLocaleDateString('sv-SE', { timeZone: config.timezone });
}

async function cachedGroupMetadata(jid) {
  if (groupMetaCache?.jid !== jid || Date.now() - groupMetaCache.at > GROUP_META_TTL_MS) {
    groupMetaCache = { jid, at: Date.now(), meta: await sock.groupMetadata(jid) };
  }
  return groupMetaCache.meta;
}

async function deliveryJid(config) {
  const { deliverTo } = config;
  if (deliverTo === 'self') return jidNormalizedUser(sock.user.id);
  const jid = deliverTo.endsWith('@g.us') ? deliverTo : resolveGroups([{ name: deliverTo }], knownGroups())[0].jid;
  const meta = jid ? await cachedGroupMetadata(jid) : null;
  checkDeliveryGroup({
    jid,
    subject: meta?.subject,
    memberCount: meta?.participants.length ?? 0,
    watchedJids: config.groups.map((g) => g.jid).filter(Boolean),
  });
  return jid;
}

async function sendDigest(text) {
  checkText(text);
  const config = loadConfig();
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: config.timezone });
  const sentToday = Number(getMeta(`sent:${today}`) || 0);
  checkDailyLimit(sentToday);
  const jid = await deliveryJid(config);
  const sent = await sock.sendMessage(jid, { text });
  ownSends.add(sent?.key?.id);
  setMeta(`sent:${today}`, sentToday + 1);
  logSent(jid, text);
}

function logSent(jid, text) {
  fs.mkdirSync(path.dirname(SENT_LOG), { recursive: true });
  fs.appendFileSync(SENT_LOG, `${new Date().toISOString()}\t${jid}\t${text.length} chars\t${text.split('\n')[0]}\n`);
}

function logAssistant(...fields) {
  fs.mkdirSync(path.dirname(ASSISTANT_LOG), { recursive: true });
  fs.appendFileSync(ASSISTANT_LOG, `${[new Date().toISOString(), ...fields].join('\t')}\n`);
}

// Replies have their own daily cap, separate from the digest's.
async function sendReply(text, { bypassLimit = false } = {}) {
  const body = `${BOT_PREFIX} ${text}`;
  checkText(body);
  const config = loadConfig();
  const day = today(config);
  const repliesToday = Number(getMeta(`replies:${day}`) || 0);
  if (!bypassLimit) checkDailyLimit(repliesToday, MAX_REPLIES_PER_DAY);
  const jid = await deliveryJid(config);
  const sent = await sock.sendMessage(jid, { text: body });
  ownSends.add(sent?.key?.id);
  setMeta(`replies:${day}`, repliesToday + 1);
  logSent(jid, body);
}

const LIMIT_NOTICES = {
  'daily-replies': 'הגעתי למגבלת התשובות היומית. אחזור לענות מחר.',
  'daily-cost': 'הגעתי למגבלת העלות היומית. אחזור לענות מחר.',
  hourly: 'יותר מדי בקשות בשעה האחרונה. נסה שוב בעוד כמה דקות.',
};
const recentRequestTimes = [];
const requestQueue = [];
let processingRequests = false;

function messageText(msg) {
  const content = normalizeMessageContent(msg.message);
  const type = getContentType(content);
  if (type === 'conversation') return content.conversation;
  if (type === 'extendedTextMessage') return content.extendedTextMessage.text;
  return null;
}

function maybeQueueRequest(msg) {
  let config;
  try {
    config = loadConfig();
  } catch {
    return;
  }
  if (!config.assistant.enabled) return;
  const jid = deliveryGroupJid(config);
  if (!jid || msg.key.remoteJid !== jid) return;
  const text = messageText(msg);
  const ts = Number(msg.messageTimestamp) * 1000;
  if (!isRequestCandidate({ text, ts, now: Date.now(), isOwnSend: ownSends.has(msg.key.id) })) return;
  const { fromMe, participant, participantAlt } = msg.key;
  const sender = fromMe ? 'me' : phoneDigits(participantAlt || participant);
  if (!isAuthorizedSender({ fromMe, participant, participantAlt, allowedNumbers: config.assistant.allowedNumbers })) {
    logAssistant(sender, 'ignored', 'sender not allowed');
    return;
  }
  if (requestQueue.length >= MAX_QUEUED_REQUESTS) {
    logAssistant(sender, 'ignored', 'queue full');
    return;
  }
  requestQueue.push({ text: text.trim(), sender });
  processRequests();
}

async function processRequests() {
  if (processingRequests) return;
  processingRequests = true;
  try {
    while (requestQueue.length) {
      const request = requestQueue.shift();
      try {
        await processRequest(request);
      } catch (err) {
        logger.error(err);
        logAssistant(request.sender, 'error', err.message);
        await sendReply('משהו השתבש, נסה שוב מאוחר יותר.').catch((e) => logger.error(e));
      }
    }
  } finally {
    processingRequests = false;
  }
}

async function processRequest({ text, sender }) {
  const config = loadConfig();
  const day = today(config);
  const now = Date.now();

  // Kill switch: no Claude call, no budget check, so it always works.
  const kill = killSwitchCommand(text);
  if (kill === 'pause') {
    setMeta('assistant_paused', 1);
    logAssistant(sender, 'pause');
    return sendReply('מושהה. לא אגיב להודעות כאן עד שתכתוב "המשך". הסיכום היומי ממשיך כרגיל.', { bypassLimit: true });
  }
  if (kill === 'resume') {
    setMeta('assistant_paused', '');
    logAssistant(sender, 'resume');
    return sendReply('חזרתי. אפשר לשאול או לבקש, ו"עזרה" מציג מה אני יודע לעשות.', { bypassLimit: true });
  }
  if (getMeta('assistant_paused')) return logAssistant(sender, 'ignored', 'paused');

  if (text.length > MAX_REQUEST_CHARS) return sendReply('ההודעה ארוכה מדי, נסה לקצר.');

  while (recentRequestTimes.length && now - recentRequestTimes[0] > 3600_000) recentRequestTimes.shift();
  const blocked = checkRequestBudget({
    repliesToday: Number(getMeta(`replies:${day}`) || 0),
    recentRequestTimes,
    now,
    usdToday: Number(getMeta(`usd:${day}`) || 0),
    maxDailyUsd: config.assistant.maxDailyUsd,
  });
  if (blocked) {
    logAssistant(sender, 'blocked', blocked);
    const noticeKey = `limit-notice:${blocked}:${blocked === 'hourly' ? new Date(now).toISOString().slice(0, 13) : day}`;
    if (getMeta(noticeKey)) return;
    setMeta(noticeKey, 1);
    return sendReply(LIMIT_NOTICES[blocked], { bypassLimit: true });
  }
  recentRequestTimes.push(now);

  const notify = (t) => sendReply(t).catch((e) => logger.error(e));
  const { reply, cost, intent } = await handleRequest(text, { notify });
  setMeta(`usd:${day}`, Number(getMeta(`usd:${day}`) || 0) + cost);
  logAssistant(sender, intent, `$${cost.toFixed(4)}`, text.replace(/\s+/g, ' ').slice(0, 200));
  await sendReply(reply);
}

// Ask your phone for older messages in each watched group, back to `days` ago.
// Replies arrive asynchronously through 'messaging-history.set'. Needs the phone online.
async function backfill(days) {
  const since = Date.now() - days * 86400_000;
  const results = [];
  for (const g of loadConfig().groups.filter((g) => g.jid)) {
    const oldest = oldestMessage(g.jid);
    if (oldest && oldest.ts <= since) {
      results.push({ group: g.name, status: 'already covered' });
    } else if (!oldest) {
      results.push({ group: g.name, status: 'no messages yet to anchor on' });
    } else {
      await sock.fetchMessageHistory(50, { remoteJid: g.jid, id: oldest.wa_id, fromMe: !!oldest.from_me }, oldest.ts);
      results.push({ group: g.name, status: 'requested older messages' });
    }
  }
  return results;
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
      await sendDigest(text);
      return reply(200, { ok: true });
    }
    if (req.method === 'POST' && req.url === '/backfill') {
      const { days } = await readJson(req);
      return reply(200, await backfill(Math.min(Math.max(Number(days) || 3, 1), 14)));
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
startEmailRefresh();
