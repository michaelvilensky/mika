// Fetches recent school emails from Gmail over IMAP (read-only).
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

const MAX_BODY_CHARS = 20000;

function matches(config, from, subject) {
  const senders = config.email.senders ?? [];
  const keywords = config.email.subjectKeywords ?? [];
  if (!senders.length && !keywords.length) return true;
  const f = from.toLowerCase();
  return senders.some((s) => f.includes(s.toLowerCase())) || keywords.some((k) => subject.includes(k));
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

export async function fetchSchoolEmails(config, sinceTs) {
  const { GMAIL_USER, GMAIL_APP_PASSWORD } = process.env;
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    console.warn('GMAIL_USER / GMAIL_APP_PASSWORD not set — skipping email.');
    return [];
  }
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
    for await (const msg of client.fetch({ since: new Date(sinceTs) }, { source: true, internalDate: true })) {
      if (msg.internalDate.getTime() < sinceTs) continue;
      const parsed = await simpleParser(msg.source);
      const from = parsed.from?.text ?? '';
      const subject = parsed.subject ?? '';
      if (!matches(config, from, subject)) continue;
      let body = stripQuoted(parsed.text || '');
      if (body.length > MAX_BODY_CHARS) body = `${body.slice(0, MAX_BODY_CHARS)}\n[...ההודעה קוצרה]`;
      emails.push({
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
