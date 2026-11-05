# Kids Digest

A daily Hebrew WhatsApp message with a summary and action items from Mika's (2nd grade) and Alon's (kindergarten) class WhatsApp groups and school emails.

```
WhatsApp groups ──► bridge.mjs (linked device, always on) ──► data/digest.db ─┐
Gmail (IMAP, read-only, school senders only) ─────────────────────────────────┼─► digest.mjs ─► Claude ─► "Kids Digest" group + ntfy ping
                                                         (daily at 19:30)     ┘
```

- **bridge.mjs** links to your WhatsApp as a linked device (like WhatsApp Web). It receives messages live and stores *only* those from the groups in `config.json`, including photos and PDFs. It posts the digest to your Kids Digest group. It stays "offline" and sends no read receipts, so your phone keeps getting notifications and nobody sees blue ticks from it.
- **digest.mjs** collects everything since the last digest, adds the school emails, asks Claude (Opus 5.5) for a digest, sends it, and pings your phone through ntfy.
- **init.mjs** is a one-time catch-up: a digest of the last few days.

## One-time setup

```bash
cd kids-digest && npm ci        # installs the exact versions in package-lock.json
cp .env.example .env            # then fill it in (see below)
cp config.example.json config.json
```

1. **`.env`**
   - `ANTHROPIC_API_KEY`: from console.anthropic.com.
   - `GMAIL_USER` / `GMAIL_APP_PASSWORD`: your personal Gmail and an [App Password](https://myaccount.google.com/apppasswords). It requires 2-Step Verification, see [Guardrails](#guardrails).
   - `NTFY_TOPIC`: install the ntfy app ([iOS](https://apps.apple.com/app/ntfy/id1625396347) / [Android](https://play.google.com/store/apps/details?id=io.heckel.ntfy)). Make a random topic name with `echo kids-$(openssl rand -hex 8)` and subscribe to it in the app.
   - `BRIDGE_TOKEN`: run `openssl rand -hex 24`.
2. **Create the "Kids Digest" WhatsApp group.** WhatsApp needs one member to create a group: add anyone, then remove them. You can also add your partner. The group may have at most 3 members.
3. **Link WhatsApp.** Run `npm run bridge` and scan the QR code: WhatsApp → Settings → Linked devices → Link a device. Leave it running. The log lists which configured groups it matched.
4. **Groups and emails** are in `config.json`:
   - Each group: its WhatsApp name, `kid` and `type` (`official` / `grade` / `afterschool` / `parents`). Names match even if quote marks or spacing differ. Run `npm run groups` in a second terminal to see all your groups, with ✓ next to the watched ones.
   - `email.senders`: what to match in the From line (an address, a domain or a display name), plus an optional `note` saying who the sender is.
5. **Catch up and test.** Keep WhatsApp open on your phone and run:
   ```bash
   npm run init -- 3 --dry-run   # print a digest of the last 3 days without sending
   npm run init -- 3             # send it to Kids Digest
   ```
   Init asks your phone for older messages in the watched groups, 50 at a time, then summarizes. WhatsApp also sends a few recent days automatically when you first link.
6. **Go live.** Stop the foreground bridge (Ctrl+C) and run `npm run install-launchd`. See [Running in the background](#running-in-the-background).

## Running in the background

`npm run install-launchd` registers two macOS launchd agents. launchd is the built-in way to run background jobs, so no extra software is needed.

- `com.kidsdigest.bridge`: starts at login and restarts if it crashes.
- `com.kidsdigest.digest`: runs daily at `schedule`. If the Mac was asleep then, it runs on wake.
- `com.kidsdigest.reminder`: at `reminder` (18:30), re-sends the "✅ לפעולה" items from that day's digest. If there were none, it sends nothing. Remove `reminder` from `config.json` and re-run the install to turn it off.

The Mac must be awake to receive messages and send on time. A sleeping Mac or a closed laptop runs nothing; messages are caught up on wake. On a laptop that stays plugged in, turn on System Settings → Battery → Options → "Prevent automatic sleeping on power adapter when the display is off".

Day to day:
- Logs: `data/logs/bridge.log`, `data/logs/digest.log`, `data/logs/sent.log` (every message the bridge sent) and `data/logs/assistant.log` (every request, its action and cost). Every digest is also saved in `data/digests/`.
- Send one now: `npm run digest`, or print one without sending: `npm run digest:dry`.
- Change the time: write "שנה את שעת הסיכום ל-18:00" in the Kids Digest group, or edit `schedule` and run `npm run install-launchd` again.
- Tests for the guardrails: `npm test`.

## Asking questions in the Kids Digest group

Write in the Kids Digest group and the bridge answers there, with replies starting with 🤖. "עזרה" lists what it can do:
- **Questions** about the last 14 days of the watched groups, school emails and recent digests: "מה מיקה צריכה להביא מחר?", "מה כתבו בקבוצת ההורים על הצהרון?". Follow-ups like "ואלון?" work for 30 minutes.
- **Commands:** "שלח סיכום עכשיו", "דלג על הסיכום היום" / "בטל דילוג", "סטטוס", "אילו קבוצות במעקב?".
- **Settings changes**, which wait for your "כן": "שנה את שעת הסיכום ל-18:00", "הוסף את הקבוצה X כקבוצת הורים של אלון", "הסר את הקבוצה X".
- **Kill switch:** "עצור" pauses the assistant completely (the daily digest keeps running), and "המשך" turns it back on. To turn it off for good, set `assistant.enabled` to `false` in `config.json`.

A question takes about 10 seconds and typically costs $0.02 to $0.15. Emails are refreshed in the background every 20 minutes, because Gmail is slow.
- Uninstall: `bash scripts/install-launchd.sh --uninstall`.

**On Linux** (a server or a Raspberry Pi), use `npm run install-systemd` instead. It installs the same three jobs as systemd user units. Run `sudo loginctl enable-linger $USER` once first, so they keep running when you're logged out. If the machine is off at the scheduled time, the job runs when it boots. Check them with `systemctl --user list-timers` and `systemctl --user status kids-digest-bridge`.

## Guardrails

**Claude can't do anything on its own.** The digest and the answers to questions come from calls that get the messages as text and return text. They have no tools and no access to your accounts. They're told to ignore instructions inside messages, so a malicious message can at most distort a summary or an answer.

**Requests in the Kids Digest group** ([src/assistant.mjs](src/assistant.mjs)):
- **Only you.** Only messages from your own account count, plus numbers you add to `assistant.allowedNumbers`. Everyone else is ignored and logged. Only plain text written in the last 10 minutes counts, never the bot's own replies or digests, so it can't answer itself in a loop.
- **The model that picks the action never sees group data.** A first call sees only your own messages and picks one action from a fixed list. A separate, tool-less call reads the group data and writes the answer. Text inside a class group therefore can't trigger an action.
- **Actions are fixed and checked in code.** The digest time must be between 06:00 and 22:59. A group being added must exist, be new, not be Kids Digest, and name a kid and a group type. Changing where the digest goes, email settings, or any limit isn't possible from chat. Settings changes need a "כן" from you within 10 minutes. `config.json` is backed up to `data/config-backups/` before each change.
- **Limits:** 30 replies a day (separate from the digest's 3), 10 requests an hour, $1.50 a day of estimated API cost (`assistant.maxDailyUsd`), requests up to 1,000 characters, and at most 3 queued. When a limit is hit it says so once, then stays quiet.
- **Kill switch:** "עצור" and "המשך" are handled without calling Claude and bypass the limits, so they always work.

**Sending.** All sends go through `sendDigest` and `sendReply` in [src/bridge.mjs](src/bridge.mjs); nothing else in the code sends. The rules are in [src/guards.mjs](src/guards.mjs):
- It sends only to `deliverTo` (Kids Digest).
- It refuses if that is one of the watched class groups, or a group with more than 3 members.
- At most 3 digests (including the reminder) and 30 replies a day, each up to 10,000 characters.
- Every send is logged to `data/logs/sent.log`.
- Its control interface listens only on your own Mac (127.0.0.1) and requires `BRIDGE_TOKEN`.

**Reading WhatsApp.** Only messages from the configured groups are stored. Everything else the linked device receives is dropped in memory.

**Gmail.** Gmail itself is searched for the configured senders only (`from:… OR from:…`), so other mail is never downloaded. The mailbox is opened read-only. With no sender filters, it refuses to run instead of reading the whole inbox.

**Files.** `data/` (WhatsApp session keys, messages, media) and `.env` are readable only by your user. `.env`, `config.json` and `data/` are never committed. Dependencies are pinned in the committed `package-lock.json`, so use `npm ci`.

**What a code guardrail can't stop.** The WhatsApp session is a real linked device on your account, and the App Password is full Gmail access. Google has no read-only App Password. These limits are enforced by this code, not by WhatsApp or Google. To limit the damage:
- **Turn on FileVault**, so a stolen Mac doesn't expose `data/wa-auth/`.
- **Cut it off anytime:** on your phone, go to WhatsApp → Linked devices → Kids Digest → Log out. For Gmail, delete the App Password at myaccount.google.com/apppasswords.
- **2-Step Verification:** Google requires it on before it lets you create an App Password. The App Password itself skips the second factor, because that's its purpose. Keep it only in `.env`, and revoke it if the Mac is lost.
- **WhatsApp two-step verification:** Settings → Account → Two-step verification sets a PIN. That stops someone from re-registering your number, though it doesn't affect linked devices.
- **Strongest option for email:** create a separate Gmail account just for this. In your main Gmail, add a filter that forwards the school senders to it, and put *that* account's App Password in `.env`. The agent then has no access to your real inbox at all.

## Notes

- **Unofficial API.** The bridge uses [Baileys](https://github.com/WhiskeySockets/Baileys), a reverse-engineered WhatsApp Web client. It reads, and posts only to your own small group: the digest plus replies to you, which is low-risk. Still, WhatsApp's terms don't allow unofficial clients.
- **Privacy.** Messages are stored locally and sent only to the Claude API to make the digest. The ntfy ping is a generic "digest ready" line, never the content.
- **Cost.** About one Opus 5.5 call per day for the digest. Typically a few cents, more when there are many photos. Questions add about $0.02 to $0.15 each, capped at $1.50 a day.
