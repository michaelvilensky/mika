// Fetches recent school emails from Gmail over IMAP (read-only).
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

const MAX_BODY_CHARS = 20000;

// senders: strings or { match, note } — match is an address, domain or display name in the From line.
function senderRules(config) {
  return (config.email.senders ?? []).map((s) => (typeof s === 'string' ? { match: s } : s));
}

// Gmail does the filtering, so mail from anyone else is never downloaded.
export function gmailQuery(config, sinceTs) {
  const quote = (s) => `"${s.replace(/"/g, '')}"`;
  const terms = [
    ...senderRules(config).map((s) => `from:${quote(s.match)}`),
    ...(config.email.subjectKeywords ?? []).map((k) => `subject:${quote(k)}`),
  ];
  if (!terms.length) throw new Error('config.email has no senders or subjectKeywords — refusing to read the whole inbox');
  return `(${terms.join(' OR ')}) after:${Math.floor(sinceTs / 1000)}`;
}

// Second check on what Gmail returned. Returns { note } when the email is school mail, or null.
function matches(config, from, subject) {
  const senders = senderRules(config);
  const keywords = config.email.subjectKeywords ?? [];
  const f = from.toLowerCase();
  const sender = senders.find((s) => f.includes(s.match.toLowerCase()));
  if (sender) return { note: sender.note };
  return keywords.some((k) => subject.includes(k)) ? {} : null;
}

function stripQuoted(text) {
  // Drop the quoted history of reply chains ("On ... wrote:" / "> ...").
  const cut = text.search(/^(On .+wrote:|ב.+כתב\/ה:|-----Original Message-----)/m);
  return (cut > 0 ? text.slice(0, cut) : text)
    .split('\n')
    .filter((l) => !l.startsWith('>'))
    .join('\n')
    .trim();
}

// known: optional Map uid → email (or null for non-school mail) from earlier calls; those aren't downloaded again.
export async function fetchSchoolEmails(config, sinceTs, known = new Map()) {
  const { GMAIL_USER, GMAIL_APP_PASSWORD } = process.env;
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    console.warn('GMAIL_USER / GMAIL_APP_PASSWORD not set — skipping email.');
    return [];
  }
  const query = gmailQuery(config, sinceTs);
  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
    logger: false,
  });
  await client.connect();
  const emails = [];
  const lock = await client.getMailboxLock(config.email.mailbox || 'INBOX', { readOnly: true });
  try {
    const uids = (await client.search({ gmraw: query }, { uid: true })) || [];
    for (const uid of uids) {
      const email = known.get(uid);
      if (email && email.date.getTime() >= sinceTs) emails.push(email);
    }
    const fresh = uids.filter((uid) => !known.has(uid));
    if (!fresh.length) return emails;
    for await (const msg of client.fetch(fresh, { source: true, internalDate: true }, { uid: true })) {
      if (msg.internalDate.getTime() < sinceTs) continue;
      const parsed = await simpleParser(msg.source);
      const from = parsed.from?.text ?? '';
      const subject = parsed.subject ?? '';
      const match = matches(config, from, subject);
      if (!match) {
        known.set(msg.uid, null);
        continue;
      }
      let body = stripQuoted(parsed.text || '');
      if (body.length > MAX_BODY_CHARS) body = `${body.slice(0, MAX_BODY_CHARS)}\n[...ההודעה קוצרה]`;
      emails.push({
        uid: msg.uid,
        note: match.note,
        from,
        subject,
        date: msg.internalDate,
        body,
        attachments: (parsed.attachments || []).map((a) => ({
          filename: a.filename,
          contentType: a.contentType,
          content: a.content,
        })),
      });
    }
  } finally {
    lock.release();
    await client.logout();
  }
  return emails;
}
