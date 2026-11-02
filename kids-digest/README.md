# Kids Digest

A daily Hebrew WhatsApp message with a summary and action items from Mika's (2nd grade) and Alon's (kindergarten) class WhatsApp groups and school emails.

```
WhatsApp groups ──► bridge.mjs (linked device, always on) ──► data/digest.db ─┐
Gmail (IMAP, read-only) ──────────────────────────────────────────────────────┼─► digest.mjs ─► Claude ─► WhatsApp "Message yourself"
                                                         (daily at 19:30)     ┘
```

- **bridge.mjs** links to your WhatsApp as a linked device (like WhatsApp Web), stores messages *only* from the groups listed in `config.json` (including photos and PDFs), and sends the digest to you. It stays "offline" so your phone keeps getting notifications.
- **digest.mjs** collects everything since the last digest, adds matching Gmail emails, asks Claude (Opus 5.5) for a digest, and sends it.
- Claude gets no tools. It only reads the messages and writes text, so a message in a group can't make it do anything.

## One-time setup

```bash
cd kids-digest && npm install
cp .env.example .env            # then fill it in (see below)
cp config.example.json config.json
```

1. **`.env`**
   - `ANTHROPIC_API_KEY`: from console.anthropic.com.
   - `GMAIL_USER` / `GMAIL_APP_PASSWORD`: your personal Gmail and an [App Password](https://myaccount.google.com/apppasswords). Your account needs 2-Step Verification for this. The app password only gives IMAP access, and you can revoke it anytime.
   - `BRIDGE_TOKEN`: run `openssl rand -hex 24`.
2. **Link WhatsApp.** Run `npm run bridge` and scan the QR code: WhatsApp → Settings → Linked devices → Link a device. Leave it running.
3. **Pick the groups.** In `config.json` → `groups`, list each group by its WhatsApp name, with its `kid` and `type`:
   - `official`: staff to parents
   - `grade`: grade-level announcements
   - `afterschool`: the צהרון
   - `parents`: the unofficial parents chat. Practical items and serious concerns (staff problems, bullying, safety, health) are kept; lost-and-found noise is skipped.

   The bridge matches names when it connects. It ignores quote-mark and spacing differences, and the startup log says which groups matched. Run `npm run groups` in a second terminal to see all your groups, with ✓ next to the ones being watched.
4. **Email filters.** In `config.json` → `email.senders`, list what to match in the From line: an address, a domain or a display name. You can add a `note` saying who the sender is. If `senders` and `subjectKeywords` are both empty, all inbox mail is included.
5. **Test.** Wait for some messages to come in, then run `npm run digest:dry`. It prints the digest without sending it.
6. **Go live.** Stop the foreground bridge (Ctrl+C) and run `npm run install-launchd`. The bridge now runs in the background and restarts on login. The digest runs daily at `schedule` in config.json.

## Day to day

- Logs: `data/logs/bridge.log`, `data/logs/digest.log`. Every digest is also saved in `data/digests/`.
- Send one now: `npm run digest`.
- Change the time: edit `schedule` in config.json, then run `npm run install-launchd` again.
- Uninstall: `bash scripts/install-launchd.sh --uninstall`.
- Send the digest to a group instead of "Message yourself": set `deliverTo` to the group's name. Your phone never notifies you about messages sent from your own account, including this one. Anyone else in the group (e.g. your partner) does get a notification.

## Notes

- **The Mac must be on.** When the Mac wakes, WhatsApp delivers any messages it missed. If the Mac was asleep at digest time, launchd runs the digest on wake.
- **Unofficial API.** The bridge uses [Baileys](https://github.com/WhiskeySockets/Baileys), a reverse-engineered WhatsApp Web client. It only reads, plus one message a day to yourself, which is low-risk. Still, WhatsApp's terms don't allow unofficial clients.
- **Privacy.** `.env`, `config.json` and `data/` are gitignored. Messages are stored locally and sent only to the Claude API to make the digest.
- **Cost.** About one Opus 5.5 call per day. Typically a few cents, more when there are many photos.
