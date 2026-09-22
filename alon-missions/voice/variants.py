#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Audition alternative wordings for a clip that came out mispronounced.

Carmit reads unvocalized Hebrew, so ambiguous words need either niqqud, a
different spelling, or a rephrase. Which one works can only be settled by ear,
so this builds every candidate through the same pipeline as the real pack and
drops them in variants.html to compare.

    python3 variants.py build            # build every candidate
    python3 variants.py build n2         # just this clip's candidates
    python3 variants.py promote n2 v3    # candidate wins: write it into clips.py

After a promote, rebuild the real clip:  python3 build_voice.py n2
"""
import io
import json
import os
import re
import shutil
import sys
import tempfile

import build_voice as bv
import clips as clip_defs

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(HERE, 'variants')

# clip id -> list of (label, text, rate). The first entry should be whatever
# clips.py currently says, so there is a baseline to compare against.
CANDIDATES = {
    'n2': [
        ('v1 current',        'שתיים', clip_defs.SLOW),
        ('v2 defective',      'שתים', clip_defs.SLOW),
        ('v3 niqqud',         'שְׁתַּיִם', clip_defs.SLOW),
        ('v4 niqqud + male',  'שְׁתַּיים', clip_defs.SLOW),
        ('v5 light niqqud',   'שְתַיִם', clip_defs.SLOW),
        ('v6 slower',         'שתיים', 130),
    ],
    'session_done': [
        ('v1 current',        'כל הכבוד אלון! סיימת את כל המשימות', clip_defs.LIVELY),
        ('v2 kamatz only',    'כל הכבוד אלון! סיימתָ את כל המשימות', clip_defs.LIVELY),
        ('v3 full niqqud',    'כל הכבוד אלון! סִיַּמְתָּ את כל המשימות', clip_defs.LIVELY),
        ('v4 we finished',    'כל הכבוד אלון! סיימנו את כל המשימות', clip_defs.LIVELY),
        ('v5 no 2nd person',  'כל הכבוד אלון! כל המשימות נגמרו', clip_defs.LIVELY),
        ('v6 champion',       'איזה אלוף אתה! גמרנו את כל המשימות', clip_defs.LIVELY),
    ],
}


def build(only=None):
    bv.check_voice()
    os.makedirs(OUT_DIR, exist_ok=True)
    ids = only or list(CANDIDATES)
    for cid in ids:
        if cid not in CANDIDATES:
            sys.exit(f'No candidates defined for {cid}. Add them to CANDIDATES.')

    index = {}
    if os.path.exists(os.path.join(OUT_DIR, 'index.json')):
        with open(os.path.join(OUT_DIR, 'index.json'), encoding='utf-8') as f:
            index = json.load(f)

    tmp = tempfile.mkdtemp(prefix='variants-')
    try:
        for cid in ids:
            entries = []
            print(f'\n{cid}')
            for label, text, rate in CANDIDATES[cid]:
                tag = label.split()[0]
                name = f'{cid}__{tag}'
                raw = os.path.join(tmp, name + '.raw.wav')
                clean = os.path.join(tmp, name + '.wav')
                out = os.path.join(OUT_DIR, name + '.m4a')

                bv.synth(text, rate, raw)
                samples, sr = bv.read_wav(raw)
                samples = bv.trim_and_level(samples, sr)
                bv.write_wav(clean, samples, sr)
                if os.path.exists(out):
                    os.remove(out)
                bv.encode_aac(clean, out)

                entries.append({'tag': tag, 'label': label, 'text': text,
                                'rate': rate, 'file': name + '.m4a',
                                'duration': round(len(samples) / sr, 3)})
                print(f'  {label:18} {len(samples)/sr:4.2f}s  {text}')
            index[cid] = entries
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    with open(os.path.join(OUT_DIR, 'index.json'), 'w', encoding='utf-8') as f:
        json.dump(index, f, ensure_ascii=False, indent=2)
    print('\nOpen voice/variants.html to compare.')


def promote(cid, tag):
    entry = next((c for c in CANDIDATES.get(cid, []) if c[0].split()[0] == tag), None)
    if not entry:
        sys.exit(f'No candidate {tag} for {cid}.')
    _, text, rate = entry

    path = os.path.join(HERE, 'clips.py')
    src = io.open(path, encoding='utf-8').read()

    # Numbers live in a list, everything else in a dict keyed by clip id.
    m = re.match(r'^n(\d+)$', cid)
    if m:
        idx = int(m.group(1))
        old_word = clip_defs.NUMBERS[idx]
        before, sep, after = src.partition('NUMBERS = [')
        line_end = after.index(']')
        body = after[:line_end].replace(f"'{old_word}'", f"'{text}'", 1)
        src = before + sep + body + after[line_end:]
    elif cid in clip_defs.MISC:
        old_text = clip_defs.MISC[cid][0]
        src = src.replace(f"'{old_text}'", f"'{text}'", 1)
    else:
        sys.exit(f'promote does not know where {cid} lives in clips.py — edit it by hand.')

    io.open(path, 'w', encoding='utf-8').write(src)
    print(f'clips.py: {cid} -> {text}')

    # The question is settled, so drop the losing candidates — the winner is now
    # in the pack itself and can be re-heard there.
    index_path = os.path.join(OUT_DIR, 'index.json')
    if os.path.exists(index_path):
        with io.open(index_path, encoding='utf-8') as f:
            index = json.load(f)
        for e in index.pop(cid, []):
            f_path = os.path.join(OUT_DIR, e['file'])
            if os.path.exists(f_path):
                os.remove(f_path)
        with io.open(index_path, 'w', encoding='utf-8') as f:
            json.dump(index, f, ensure_ascii=False, indent=2)
        print(f'cleared {cid} from variants/')

    print(f'Now rebuild it:  python3 build_voice.py {cid}')


if __name__ == '__main__':
    args = sys.argv[1:]
    if args[:1] == ['promote'] and len(args) == 3:
        promote(args[1], args[2])
    elif args[:1] == ['build']:
        build(only=args[1:] or None)
    else:
        sys.exit(__doc__)
