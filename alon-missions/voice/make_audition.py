#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Build a self-contained audition page for the voice pack.

Every clip is embedded as a data: URI, so the result is one HTML file with no
server, no network and no sibling files — open it straight from Finder, or send
it to a phone and judge it on the device the game actually runs on.

    python3 make_audition.py          # -> audition.html
"""
import base64
import io
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'audition.html')

# Clips the listener already flagged as wrong, called out at the top of the page.
FLAGGED = {
    'n2': 'נשמע כמו שלוש הברות',
}

SENTENCES = [
    ('ספירה',  ['q_howmany', 'ch_dogs', 'q_yesh']),
    ('זיהוי',   ['q_where_num', 'n4']),
    ('חיבור',   ['n3', 'ch_cars', 'q_plus', 'n2', 'q_together']),
    ('חיסור (רבים)', ['q_were', 'n5', 'ch_frogs', 'q_wentaway', 'n2', 'q_howmany_left']),
    ('חיסור (יחיד)', ['q_were', 'n4', 'ch_cats', 'q_wentaway_one', 'n1', 'q_howmany_left']),
]

GROUPS = [
    ('מספרים', lambda i: i.startswith('n') and i[1:].isdigit()),
    ('מחברים', lambda i: i.startswith('q_')),
    ('שבחים ועידוד', lambda i: i.startswith('cel') or i.startswith('enc') or i == 'session_done'),
    ('דמויות', lambda i: i.startswith('ch_')),
]


def b64(path):
    """Bare base64, no data: prefix — the page decodes it with atob(), so nothing
    ever goes through fetch(). Artifact iframes restrict connect-src, and a
    fetch('data:...') dies there silently."""
    with open(path, 'rb') as f:
        return base64.b64encode(f.read()).decode('ascii')


def collect():
    with io.open(os.path.join(HERE, 'manifest.json'), encoding='utf-8') as f:
        manifest = json.load(f)
    audio = {}
    for cid in manifest:
        p = os.path.join(HERE, 'clips', cid + '.m4a')
        if os.path.exists(p):
            audio[cid] = b64(p)

    variants = {}
    vpath = os.path.join(HERE, 'variants', 'index.json')
    if os.path.exists(vpath):
        with io.open(vpath, encoding='utf-8') as f:
            variants = json.load(f)
        for entries in variants.values():
            for e in entries:
                p = os.path.join(HERE, 'variants', e['file'])
                if os.path.exists(p):
                    e['b64'] = b64(p)
    return manifest, audio, variants


def build():
    manifest, audio, variants = collect()
    payload = json.dumps({
        'manifest': manifest, 'audio': audio, 'variants': variants,
        'flagged': FLAGGED, 'sentences': SENTENCES,
        'groups': [[name, [i for i in manifest if test(i)]] for name, test in GROUPS],
    }, ensure_ascii=False)

    html = TEMPLATE.replace('__DATA__', payload)
    io.open(OUT, 'w', encoding='utf-8').write(html)
    kb = os.path.getsize(OUT) / 1024
    print('audition.html  %.0f KB  (%d clips, %d variant sets)'
          % (kb, len(audio), len(variants)))


TEMPLATE = r"""<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>בדיקת קולות</title>
<style>
  :root {
    --bg: #f7f5ef; --card: #fff; --ink: #221e1a; --muted: #6b6257;
    --line: #e2dcd0; --accent: #ff6b35; --warn: #d97706;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --bg: #17151a; --card: #211e25; --ink: #f2eee8; --muted: #a49c92;
      --line: #322d38; --accent: #ff8659; --warn: #fbbf24;
    }
  }
  :root[data-theme="dark"] {
    --bg: #17151a; --card: #211e25; --ink: #f2eee8; --muted: #a49c92;
    --line: #322d38; --accent: #ff8659; --warn: #fbbf24;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 20px 16px 72px; background: var(--bg); color: var(--ink);
    font: 16px/1.5 -apple-system, "SF Hebrew", "Arial Hebrew", system-ui, sans-serif;
    -webkit-text-size-adjust: 100%;
  }
  .wrap { max-width: 720px; margin: 0 auto; }
  h1 { font-size: 1.45rem; margin: 0 0 4px; }
  .sub { color: var(--muted); margin: 0 0 20px; font-size: .92rem; }
  h2 {
    font-size: .78rem; text-transform: uppercase; letter-spacing: .08em;
    color: var(--muted); margin: 30px 0 10px; font-weight: 700;
  }
  button {
    display: flex; align-items: center; gap: 11px; width: 100%;
    padding: 13px 15px; margin-bottom: 7px; cursor: pointer; text-align: right;
    background: var(--card); border: 1px solid var(--line); border-radius: 11px;
    color: inherit; font: inherit; -webkit-tap-highlight-color: transparent;
  }
  button:active { transform: scale(0.99); }
  button.playing { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 14%, var(--card)); }
  .tag {
    font-family: ui-monospace, Menlo, monospace; font-size: .72rem;
    color: var(--muted); min-width: 2.1rem; flex-shrink: 0;
  }
  .text { flex: 1; min-width: 0; }
  .meta { font-size: .72rem; color: var(--muted); font-family: ui-monospace, Menlo, monospace; flex-shrink: 0; }
  .flag { border-right: 3px solid var(--warn); }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(155px, 1fr)); gap: 0 8px; }
  .grid button { margin-bottom: 7px; }
  .note {
    background: var(--card); border: 1px solid var(--line); border-right: 3px solid var(--accent);
    border-radius: 11px; padding: 13px 15px; margin-bottom: 20px; font-size: .9rem;
  }
  .status { min-height: 1.4em; margin: 2px 0 14px; font-size: .86rem; color: var(--muted); }
  .status.bad { color: var(--warn); font-weight: 600; }
  #tone { border-style: dashed; justify-content: center; }
  .vhead { font-family: ui-monospace, Menlo, monospace; color: var(--accent);
           font-size: 1rem; margin: 22px 0 2px; font-weight: 700; }
  .vwhy { color: var(--muted); font-size: .84rem; margin: 0 0 10px; }
  .baseline .text { opacity: .7; }
  code { font-family: ui-monospace, Menlo, monospace; font-size: .85em;
         background: color-mix(in srgb, var(--ink) 8%, transparent); padding: 1px 5px; border-radius: 4px; }
</style>
</head>
<body>
<div class="wrap">
  <h1>בדיקת קולות 🎧</h1>
  <p class="sub">הקליפים מוטמעים בקובץ — אין צורך בשרת או ברשת. אפשר לשלוח אותו לטלפון ולשמוע שם.</p>
  <div class="note">כל שורה מתנגנת בלחיצה. תגיד לי איזה <code>id</code> נשמע רע — או איזה וריאנט ניצח.</div>
  <button id="tone"><span class="text">🔈 בדיקת שמע — צליל בלי קבצים</span></button>
  <div id="status" class="status"></div>
  <div id="host"></div>
</div>

<script>
const D = __DATA__;
let ctx, mode = 'webaudio';
const decoded = {}, blobs = {};

function toBuffer(b64) {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8.buffer;
}

// Older Safari only has the callback form.
function decode(ab) {
  return new Promise((res, rej) => {
    const p = ctx.decodeAudioData(ab, res, rej);
    if (p && p.then) p.then(res, rej);
  });
}

function status(msg, bad) {
  const el = document.getElementById('status');
  el.textContent = msg;
  el.className = 'status' + (bad ? ' bad' : '');
}

// Fallback path: <audio> elements over blob URLs, chained on 'ended'.
function blobUrl(id, b64) {
  if (!blobs[id]) blobs[id] = URL.createObjectURL(new Blob([toBuffer(b64)], { type: 'audio/mp4' }));
  return blobs[id];
}
function playViaAudio(items, el) {
  let i = 0;
  const next = () => {
    if (i >= items.length) { el.classList.remove('playing'); return; }
    const a = new Audio(blobUrl(items[i][0], items[i][1]));
    a.onended = () => { i++; next(); };
    a.onerror = () => { status('\u05d4\u05d3\u05e4\u05d3\u05e4\u05df \u05dc\u05d0 \u05de\u05e6\u05dc\u05d9\u05d7 \u05dc\u05e0\u05d2\u05df \u05d0\u05ea \u05e7\u05d1\u05e6\u05d9 \u05d4\u05e7\u05d5\u05dc.', true); el.classList.remove('playing'); };
    a.play().catch(() => { status('\u05d4\u05d3\u05e4\u05d3\u05e4\u05df \u05d7\u05e1\u05dd \u05d0\u05ea \u05d4\u05e0\u05d9\u05d2\u05d5\u05df. \u05dc\u05d7\u05e5 \u05e9\u05d5\u05d1.', true); el.classList.remove('playing'); });
  };
  next();
}

// Same 80ms spacing the game uses, so sentences sound exactly as they will in play.
const GAP = 0.08;
async function play(items, el) {
  document.querySelectorAll('.playing').forEach(e => e.classList.remove('playing'));
  el.classList.add('playing');
  if (mode === 'audio') return playViaAudio(items, el);
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    await ctx.resume();
    const bufs = [];
    for (const [id, data] of items) {
      if (!decoded[id]) decoded[id] = await decode(toBuffer(data));
      bufs.push(decoded[id]);
    }
    if (ctx.state !== 'running') throw new Error('context ' + ctx.state);
    let t = ctx.currentTime + 0.05;
    bufs.forEach(b => {
      const s = ctx.createBufferSource();
      s.buffer = b; s.connect(ctx.destination); s.start(t);
      t += b.duration + GAP;
    });
    setTimeout(() => el.classList.remove('playing'), (t - ctx.currentTime) * 1000);
    status('');
  } catch (e) {
    mode = 'audio';
    status('\u05e2\u05d1\u05e8\u05ea\u05d9 \u05dc\u05e0\u05d2\u05df \u05d7\u05dc\u05d5\u05e4\u05d9 (' + e.message + ')');
    playViaAudio(items, el);
  }
}

// A pure tone needs no decoding at all — if this is silent the problem is the
// device or the browser, not the clips.
async function testTone(btn) {
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    await ctx.resume();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = 660; g.gain.value = 0.18;
    o.connect(g); g.connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + 0.4);
    btn.classList.add('playing');
    setTimeout(() => btn.classList.remove('playing'), 450);
    status('\u05d1\u05d3\u05d9\u05e7\u05d4 \u05e0\u05d5\u05d2\u05e0\u05d4. \u05de\u05e6\u05d1 \u05d4\u05d0\u05d5\u05d3\u05d9\u05d5: ' + ctx.state);
  } catch (e) {
    status('\u05d0\u05d9 \u05d0\u05e4\u05e9\u05e8 \u05dc\u05e4\u05ea\u05d5\u05d7 \u05d0\u05d5\u05d3\u05d9\u05d5 \u05d1\u05d3\u05e4\u05d3\u05e4\u05df \u05d4\u05d6\u05d4: ' + e.message, true);
  }
}

document.getElementById('tone').addEventListener('click', (e) => testTone(e.currentTarget));
const host = document.getElementById('host');
function el(tag, cls, html) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html) n.innerHTML = html;
  return n;
}
function row(parent, cls, html, items) {
  const b = el('button', cls, html);
  b.addEventListener('click', () => play(items, b));
  parent.appendChild(b);
  return b;
}

// --- flagged clips and their candidate rewordings, first ---
if (Object.keys(D.variants).length) {
  host.appendChild(el('h2', null, 'הגייה לתיקון — בחר וריאנט'));
  for (const [cid, entries] of Object.entries(D.variants)) {
    host.appendChild(el('div', 'vhead', cid));
    host.appendChild(el('div', 'vwhy', D.flagged[cid] ? 'סימנת: ' + D.flagged[cid] : ''));
    entries.forEach((e, i) => {
      row(host, i === 0 ? 'baseline' : '',
          `<span class="tag">${e.tag}</span><span class="text">${e.text}</span>` +
          `<span class="meta">${e.duration}s</span>`,
          [[cid + e.tag, e.b64]]);
    });
  }
}

// --- assembled sentences ---
host.appendChild(el('h2', null, 'משפטים מורכבים — כך זה נשמע במשחק'));
D.sentences.forEach(([label, ids]) => {
  const words = ids.map(i => D.manifest[i].text).join(' ');
  row(host, null, `<span class="text"><strong>${label}:</strong> ${words}</span>`,
      ids.map(i => [i, D.audio[i]]));
});

// --- the whole pack, by category ---
D.groups.forEach(([name, ids]) => {
  host.appendChild(el('h2', null, name));
  const grid = el('div', 'grid');
  host.appendChild(grid);
  ids.forEach(id => {
    row(grid, D.flagged[id] ? 'flag' : '',
        `<span class="text">${D.manifest[id].text}</span><span class="tag">${id}</span>`,
        [[id, D.audio[id]]]);
  });
});
</script>
</body>
</html>
"""

if __name__ == '__main__':
    build()
