// Rules for the only message the bridge ever sends. Pure functions, so they're testable.
export const MAX_SENDS_PER_DAY = 3;
export const MAX_TEXT_CHARS = 10000;
export const MAX_DELIVERY_GROUP_MEMBERS = 3; // you, plus e.g. your partner

export function checkText(text) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('text required');
  if (text.length > MAX_TEXT_CHARS) throw new Error(`text too long (${text.length} chars)`);
}

export function checkDailyLimit(sentToday) {
  if (sentToday >= MAX_SENDS_PER_DAY) throw new Error(`daily send limit reached (${MAX_SENDS_PER_DAY})`);
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
