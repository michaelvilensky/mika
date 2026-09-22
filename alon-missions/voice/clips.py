# -*- coding: utf-8 -*-
"""Clip inventory for the alon-missions voice pack.

Each entry: id -> (hebrew_text, rate_wpm)
Rate is passed to `say -r`. Lower = slower. Default for this game is deliberately
slow, since the listener is 4 years old.
"""

SLOW = 150
NORMAL = 165
LIVELY = 185

# Feminine number words — Hebrew counts collectively in the feminine.
NUMBERS = ['אפס', 'אחת', 'שתיים', 'שלוש', 'ארבע', 'חמש', 'שש', 'שבע', 'שמונה', 'תשע', 'עשר']

# id -> spoken name. Ids are referenced from index.html (CHARACTERS[].voiceId).
CHARACTERS = {
    'ch_cars':       'מכוניות',
    'ch_police':     'ניידות משטרה',
    'ch_firetruck':  'משאיות כיבוי',
    'ch_trucks':     'משאיות',
    'ch_taxis':      'מוניות',
    'ch_buses':      'אוטובוסים',
    'ch_ambulance':  'אמבולנסים',
    'ch_rockets':    'חלליות',
    'ch_dogs':       'כלבים',
    'ch_puppies':    'גורים',
    'ch_heroes_m':   'גיבורים',
    'ch_heroes_f':   'גיבורות',
    'ch_rabbits':    'ארנבים',
    'ch_cats':       'חתולים',
    'ch_bears':      'דובים',
    'ch_foxes':      'שועלים',
    'ch_lions':      'אריות',
    'ch_tigers':     'נמרים',
    'ch_frogs':      'צפרדעים',
    'ch_cows':       'פרות',
    'ch_pigs':       'חזירים',
    'ch_monkeys':    'קופים',
    'ch_elephants':  'פילים',
    'ch_pandas':     'פנדות',
    'ch_giraffes':   'ג׳ירפות',
    'ch_butterflies':'פרפרים',
    'ch_penguins':   'פינגווינים',
    'ch_stars':      'כוכבים',
    'ch_gems':       'יהלומים',
}

# Sentence connectors. Sentences are assembled from these + numbers + characters.
CONNECTORS = {
    'q_howmany':      'כמה',
    'q_yesh':         'יש',
    'q_where_num':    'איפה המספר',
    'q_plus':         'ועוד',
    'q_together':     'כמה יחד',
    'q_were':         'היו',
    'q_wentaway':     'הלכו',
    'q_wentaway_one': 'הלכה',
    'q_howmany_left': 'כמה נשארו',
}

CELEBRATIONS = [
    'כל הכבוד אלון',
    'מצוין',
    'ואו, אלוף',
    'איזה גיבור',
    'יופי',
    'בדיוק נכון',
    'כל הכבוד',
    'נהדר',
]

ENCOURAGEMENTS = [
    'כמעט. עוד פעם',
    'ננסה שוב',
    'אופס, ננסה עוד פעם',
]

MISC = {
    'session_done': ('כל הכבוד אלון! סִיַּמְתָּ את כל המשימות', LIVELY),
}


def build():
    """Return an ordered dict of clip_id -> (text, rate)."""
    clips = {}
    for i, w in enumerate(NUMBERS):
        clips[f'n{i}'] = (w, SLOW)
    for cid, name in CHARACTERS.items():
        clips[cid] = (name, NORMAL)
    for cid, text in CONNECTORS.items():
        clips[cid] = (text, NORMAL)
    for i, line in enumerate(CELEBRATIONS):
        clips[f'cel{i}'] = (line, LIVELY)
    for i, line in enumerate(ENCOURAGEMENTS):
        clips[f'enc{i}'] = (line, NORMAL)
    clips.update(MISC)
    return clips


if __name__ == '__main__':
    c = build()
    print(f'{len(c)} clips')
