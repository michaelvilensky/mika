// Load a profile from Netlify Blobs by sync code.
// GET /api/profile/load?code=XXX-XXX
import { getStore } from '@netlify/blobs';

const SYNC_CODE_RE = /^[A-Z2-9]{3}-[A-Z2-9]{3}$/;

export default async (req) => {
  const url = new URL(req.url);
  const code = (url.searchParams.get('code') || '').toUpperCase();
  if (!SYNC_CODE_RE.test(code)) {
    return json({ error: 'Invalid sync code' }, 400);
  }

  let raw;
  try {
    const store = getStore({ name: 'profiles', consistency: 'strong' });
    raw = await store.get(`profile:${code}`);
  } catch (e) {
    return json({ error: 'Storage failed', detail: e.message }, 500);
  }

  if (!raw) return json({ error: 'Not found' }, 404);

  let profile;
  try { profile = JSON.parse(raw); }
  catch { return json({ error: 'Corrupt data' }, 500); }

  return json({ profile });
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

export const config = { path: '/api/profile/load' };
