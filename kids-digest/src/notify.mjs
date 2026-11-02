// Push notification through ntfy (https://ntfy.sh). Only a generic line is sent —
// never the digest itself — because anyone who knows the topic name can read it.
export async function notifyPhone(message) {
  const topic = process.env.NTFY_TOPIC;
  if (!topic) return;
  const server = process.env.NTFY_SERVER || 'https://ntfy.sh';
  try {
    const res = await fetch(`${server}/${encodeURIComponent(topic)}`, {
      method: 'POST',
      headers: { Title: 'Kids Digest', Tags: 'clipboard' },
      body: message,
    });
    if (!res.ok) console.warn(`ntfy failed: ${res.status}`);
  } catch (err) {
    console.warn(`ntfy failed: ${err.message}`);
  }
}
