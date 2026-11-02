import { BRIDGE_PORT, BRIDGE_TOKEN } from './config.mjs';

export async function bridge(method, urlPath, body) {
  const res = await fetch(`http://127.0.0.1:${BRIDGE_PORT}${urlPath}`, {
    method,
    headers: { authorization: `Bearer ${BRIDGE_TOKEN}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  }).catch(() => {
    throw new Error('WhatsApp bridge is not running — start it with `npm run bridge`.');
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Bridge ${urlPath} failed: ${data.error}`);
  return data;
}
