import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_REPLIES_PER_DAY, MAX_REQUESTS_PER_HOUR, MAX_REQUEST_AGE_MS, checkDailyLimit, checkDeliveryGroup, checkRequestBudget,
  isAuthorizedSender, isCancellation, isConfirmation, isRequestCandidate, killSwitchCommand, usageCostUsd,
  validateNewGroup, validateSchedule,
} from '../src/guards.mjs';

test('only you, or listed numbers, are authorized', () => {
  assert.equal(isAuthorizedSender({ fromMe: true }), true);
  assert.equal(isAuthorizedSender({ fromMe: false, participant: '972501112222@s.whatsapp.net' }), false);
  assert.equal(isAuthorizedSender({
    fromMe: false, participant: '12345@lid', participantAlt: '972501112222@s.whatsapp.net', allowedNumbers: ['+972-50-111-2222'],
  }), true);
  // A LID that happens to share digits with an allowed number isn't a phone number.
  assert.equal(isAuthorizedSender({ fromMe: false, participant: '972501112222@lid', allowedNumbers: ['972501112222'] }), false);
});

test('own replies, digests and stale messages are never requests', () => {
  const now = Date.now();
  assert.equal(isRequestCandidate({ text: 'מה מחר?', ts: now, now, isOwnSend: false }), true);
  assert.equal(isRequestCandidate({ text: 'מה מחר?', ts: now, now, isOwnSend: true }), false);
  assert.equal(isRequestCandidate({ text: '🤖 תשובה', ts: now, now, isOwnSend: false }), false);
  assert.equal(isRequestCandidate({ text: '*📋 סיכום יומי*', ts: now, now, isOwnSend: false }), false);
  assert.equal(isRequestCandidate({ text: '*⏰ תזכורת — לפעולה*', ts: now, now, isOwnSend: false }), false);
  assert.equal(isRequestCandidate({ text: 'מה מחר?', ts: now - MAX_REQUEST_AGE_MS - 1, now, isOwnSend: false }), false);
  assert.equal(isRequestCandidate({ text: '  ', ts: now, now, isOwnSend: false }), false);
  assert.equal(isRequestCandidate({ text: null, ts: now, now, isOwnSend: false }), false);
});

test('request budget: replies per day, cost per day, requests per hour', () => {
  const now = Date.now();
  const ok = { repliesToday: 0, recentRequestTimes: [], now, usdToday: 0 };
  assert.equal(checkRequestBudget(ok), null);
  assert.equal(checkRequestBudget({ ...ok, repliesToday: MAX_REPLIES_PER_DAY }), 'daily-replies');
  assert.equal(checkRequestBudget({ ...ok, usdToday: 1.5 }), 'daily-cost');
  assert.equal(checkRequestBudget({ ...ok, usdToday: 1.5, maxDailyUsd: 3 }), null);
  assert.equal(checkRequestBudget({ ...ok, recentRequestTimes: Array(MAX_REQUESTS_PER_HOUR).fill(now - 1000) }), 'hourly');
  assert.equal(checkRequestBudget({ ...ok, recentRequestTimes: Array(MAX_REQUESTS_PER_HOUR).fill(now - 3601_000) }), null);
});

test('daily send limits', () => {
  assert.doesNotThrow(() => checkDailyLimit(2));
  assert.throws(() => checkDailyLimit(3), /limit/);
  assert.throws(() => checkDailyLimit(30, 30), /limit/);
});

test('delivery group must be small and not a class group', () => {
  assert.doesNotThrow(() => checkDeliveryGroup({ jid: 'a@g.us', subject: 'Kids Digest', memberCount: 1, watchedJids: [] }));
  assert.throws(() => checkDeliveryGroup({ jid: 'a@g.us', subject: 'x', memberCount: 4, watchedJids: [] }), /members/);
  assert.throws(() => checkDeliveryGroup({ jid: 'a@g.us', subject: 'x', memberCount: 1, watchedJids: ['a@g.us'] }), /watched/);
  assert.throws(() => checkDeliveryGroup({ jid: null, memberCount: 1, watchedJids: [] }), /not found/);
});

test('schedule must be a sane daytime hour', () => {
  assert.equal(validateSchedule(17, 0), null);
  assert.ok(validateSchedule(3, 0));
  assert.ok(validateSchedule(23, 0));
  assert.ok(validateSchedule(17, 60));
  assert.ok(validateSchedule(null, 0));
});

test('new group must exist, be new, not be the delivery group, and name a kid and type', () => {
  const base = {
    match: { jid: 'new@g.us', name: 'הורי גן' }, kid: 'אלון', type: 'parents',
    kids: [{ name: 'מיקה' }, { name: 'אלון' }], resolved: [{ jid: 'old@g.us' }], deliveryJid: 'kd@g.us',
  };
  assert.equal(validateNewGroup(base), null);
  assert.ok(validateNewGroup({ ...base, match: null }));
  assert.ok(validateNewGroup({ ...base, match: { jid: 'kd@g.us', name: 'Kids Digest' } }));
  assert.ok(validateNewGroup({ ...base, match: { jid: 'old@g.us', name: 'x' } }));
  assert.ok(validateNewGroup({ ...base, kid: 'דני' }));
  assert.ok(validateNewGroup({ ...base, type: 'family' }));
});

test('confirmation, cancellation and kill switch are exact words only', () => {
  assert.equal(isConfirmation('כן'), true);
  assert.equal(isConfirmation('כן!'), true);
  assert.equal(isConfirmation('כן, ותשנה גם את הקבוצה'), false);
  assert.equal(isCancellation('לא'), true);
  assert.equal(killSwitchCommand('עצור'), 'pause');
  assert.equal(killSwitchCommand('Stop'), 'pause');
  assert.equal(killSwitchCommand('המשך'), 'resume');
  assert.equal(killSwitchCommand('עצור את הסיכום של מחר'), null);
});

test('cost estimate', () => {
  assert.equal(usageCostUsd({ input_tokens: 1_000_000, output_tokens: 0 }), 4);
  assert.equal(usageCostUsd({ input_tokens: 0, output_tokens: 100_000 }), 2);
  assert.equal(usageCostUsd(null), 0);
});
