// Rules for everything the bridge sends and every request it accepts. Pure functions, so they're testable.
export const MAX_SENDS_PER_DAY = 3;
export const MAX_TEXT_CHARS = 10000;
export const MAX_DELIVERY_GROUP_MEMBERS = 3; // you, plus e.g. your partner

// Assistant (requests you write in the Kids Digest group).
export const MAX_REPLIES_PER_DAY = 30;
export const MAX_REQUESTS_PER_HOUR = 10;
export const MAX_REQUEST_CHARS = 1000;
export const MAX_QUEUED_REQUESTS = 3;
export const MAX_REQUEST_AGE_MS = 10 * 60 * 1000;
export const DEFAULT_MAX_DAILY_USD = 1.5;
export const CONFIRM_TTL_MS = 10 * 60 * 1000;
export const BOT_PREFIX = '🤖';
export const DIGEST_PREFIX = '*📋';
export const REMINDER_PREFIX = '*⏰';
export const GROUP_TYPES = ['official', 'grade', 'afterschool', 'parents'];
export const SCHEDULE_HOURS = { min: 6, max: 22 };

export function checkText(text) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('text required');
  if (text.length > MAX_TEXT_CHARS) throw new Error(`text too long (${text.length} chars)`);
}

export function checkDailyLimit(sentToday, max = MAX_SENDS_PER_DAY) {
  if (sentToday >= max) throw new Error(`daily send limit reached (${max})`);
}

export function checkDeliveryGroup({ jid, subject, memberCount, watchedJids }) {
  if (!jid) throw new Error('delivery group not found (or ambiguous)');
  if (watchedJids.includes(jid)) {
    throw new Error('deliverTo is one of the watched class groups — refusing to post the digest there');
  }
  if (memberCount > MAX_DELIVERY_GROUP_MEMBERS) {
    throw new Error(`deliverTo group "${subject}" has ${memberCount} members (max ${MAX_DELIVERY_GROUP_MEMBERS}) — refusing`);
  }
}

export function phoneDigits(s) {
  return String(s || '').split('@')[0].split(':')[0].replace(/\D/g, '');
}

// You (any message from your own account), or a number listed in config.assistant.allowedNumbers.
export function isAuthorizedSender({ fromMe, participant, participantAlt, allowedNumbers = [] }) {
  if (fromMe) return true;
  const allowed = new Set(allowedNumbers.map(phoneDigits).filter(Boolean));
  return [participant, participantAlt].some((jid) => jid?.endsWith('@s.whatsapp.net') && allowed.has(phoneDigits(jid)));
}

// Only plain text written just now; never our own replies or digests (they also arrive as fromMe).
export function isRequestCandidate({ text, ts, now, isOwnSend }) {
  if (isOwnSend || typeof text !== 'string' || !text.trim()) return false;
  const t = text.trim();
  if ([BOT_PREFIX, DIGEST_PREFIX, REMINDER_PREFIX].some((p) => t.startsWith(p))) return false;
  return now - ts <= MAX_REQUEST_AGE_MS;
}

// Returns null when allowed, or the reason it isn't.
export function checkRequestBudget({ repliesToday, recentRequestTimes, now, usdToday, maxDailyUsd = DEFAULT_MAX_DAILY_USD }) {
  if (repliesToday >= MAX_REPLIES_PER_DAY) return 'daily-replies';
  if (usdToday >= maxDailyUsd) return 'daily-cost';
  if (recentRequestTimes.filter((t) => now - t < 3600_000).length >= MAX_REQUESTS_PER_HOUR) return 'hourly';
  return null;
}

export function validateSchedule(hour, minute) {
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return 'השעה לא ברורה';
  if (minute < 0 || minute > 59) return 'הדקות צריכות להיות בין 0 ל-59';
  if (hour < SCHEDULE_HOURS.min || hour > SCHEDULE_HOURS.max) {
    return `אפשר לקבוע שעה בין ${SCHEDULE_HOURS.min}:00 ל-${SCHEDULE_HOURS.max}:59`;
  }
  return null;
}

// match: the one group in groups.json with that name; resolved: config.groups after resolveGroups.
export function validateNewGroup({ match, kid, type, kids, resolved, deliveryJid }) {
  if (!match) return 'לא מצאתי קבוצה אחת בשם הזה (או שיש כמה דומות)';
  if (match.jid === deliveryJid) return 'זו קבוצת הסיכום עצמה';
  if (resolved.some((g) => g.jid === match.jid)) return 'הקבוצה הזאת כבר במעקב';
  if (!kids.some((k) => k.name === kid)) return `לא ברור לאיזה ילד הקבוצה שייכת (${kids.map((k) => k.name).join(' / ')})`;
  if (!GROUP_TYPES.includes(type)) return 'סוג הקבוצה לא ברור';
  return null;
}

export function isConfirmation(text) {
  return /^(כן|yes|אשר|מאשר|מאשרת|ok|אוקי|y)[.!]?$/i.test(text.trim());
}

export function isCancellation(text) {
  return /^(לא|no|בטל|ביטול|n)[.!]?$/i.test(text.trim());
}

// Kill switch — handled without calling Claude, so it always works.
export function killSwitchCommand(text) {
  const t = text.trim().toLowerCase();
  if (/^(עצור|השהה|stop|pause)[.!]?$/.test(t)) return 'pause';
  if (/^(המשך|הפעל|resume|start)[.!]?$/.test(t)) return 'resume';
  return null;
}

// Opus 5.5 list prices per million tokens.
const USD_PER_MTOK = { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 };

export function usageCostUsd(usage) {
  if (!usage) return 0;
  return (
    (usage.input_tokens || 0) * USD_PER_MTOK.input +
    (usage.output_tokens || 0) * USD_PER_MTOK.output +
    (usage.cache_read_input_tokens || 0) * USD_PER_MTOK.cacheRead +
    (usage.cache_creation_input_tokens || 0) * USD_PER_MTOK.cacheWrite
  ) / 1e6;
}
