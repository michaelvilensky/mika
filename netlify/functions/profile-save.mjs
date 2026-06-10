// Save a profile to Netlify Blobs, keyed by its sync code.
// POST /api/profile/save  body: { syncCode, profile }
import { getStore } from '@netlify/blobs';

const SYNC_CODE_RE = /^[A-Z2-9]{3}-[A-Z2-9]{3}$/;
const MAX_PROFILE_BYTES = 100_000; // 100 KB hard cap to prevent abuse

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let body;
  try { body = await req.json(); }
  catch { return json({ error: 'Invalid JSON' }, 400); }

  const { syncCode, profile } = body || {};
  if (!SYNC_CODE_RE.test(syncCode || '')) {
    return json({ error: 'Invalid sync code' }, 400);
  }
  if (!profile || typeof profile !== 'object') {
    return json({ error: 'Missing profile' }, 400);
  }

  // Stamp server-side updatedAt so timezones and clock skew don't matter
  const updatedAt = Date.now();
  const toStore = { ...profile, updatedAt };

  const serialized = JSON.stringify(toStore);
  if (serialized.length > MAX_PROFILE_BYTES) {
    return json({ error: 'Profile too large' }, 413);
  }

  try {
    const store = getStore({ name: 'profiles', consistency: 'strong' });
    await store.set(`profile:${syncCode}`, serialized);
  } catch (e) {
    return json({ error: 'Storage failed', detail: e.message }, 500);
  }

  return json({ ok: true, updatedAt });
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export const config = { path: '/api/profile/save' };
