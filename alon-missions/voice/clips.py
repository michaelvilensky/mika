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
    'q_where_letter': 'איפה האות',
    'q_where_written':'איפה כתוב',
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

# Letter names. Several collide with ordinary words (בית/bayit, קוף/monkey,
# עין/eye), so these are the clips most likely to need an audition pass.
LETTERS = {
    'let_alef':   '\u05d0\u05b8\u05dc\u05b6\u05e3',
    'let_bet':    '\u05d1\u05bc\u05b5\u05d9\u05ea',
    'let_gimel':  '\u05d2\u05bc\u05b4\u05d9\u05de\u05b6\u05dc',
    'let_dalet':  '\u05d3\u05bc\u05b8\u05dc\u05b6\u05ea',
    'let_hey':    '\u05d4\u05b5\u05d0',
    'let_vav':    '\u05d5\u05b8\u05d5',
    'let_zayin':  '\u05d6\u05b7\u05d9\u05b4\u05df',
    'let_chet':   '\u05d7\u05b5\u05d9\u05ea',
    'let_tet':    '\u05d8\u05b5\u05d9\u05ea',
    'let_yod':    '\u05d9\u05d5\u05b9\u05d3',
    'let_kaf':    '\u05db\u05bc\u05b8\u05e3',
    'let_lamed':  '\u05dc\u05b8\u05de\u05b6\u05d3',
    'let_mem':    '\u05de\u05b5\u05dd',
    'let_nun':    '\u05e0\u05d5\u05bc\u05df',
    'let_samech': '\u05e1\u05b8\u05de\u05b6\u05da\u05b0',
    'let_ayin':   '\u05e2\u05b7\u05d9\u05b4\u05df',
    'let_pey':    '\u05e4\u05bc\u05b5\u05d0',
    'let_tzadi':  '\u05e6\u05b8\u05d3\u05b4\u05d9',
    'let_kof':    '\u05e7\u05d5\u05b9\u05e3',
    'let_resh':   '\u05e8\u05b5\u05d9\u05e9\u05c1',
    'let_shin':   '\u05e9\u05c1\u05b4\u05d9\u05df',
    'let_tav':    '\u05ea\u05bc\u05b8\u05d5',
}

# Short vocalized words for the reading category. Concrete, familiar at 4, and
# each one has an emoji in index.html so the meaning is never in doubt.
WORDS = {
    'w_aba':    '\u05d0\u05b7\u05d1\u05bc\u05b8\u05d0',
    'w_ima':    '\u05d0\u05b4\u05de\u05bc\u05b8\u05d0',
    'w_dov':    '\u05d3\u05bc\u05b9\u05d1',
    'w_pil':    '\u05e4\u05bc\u05b4\u05d9\u05dc',
    'w_kelev':  '\u05db\u05bc\u05b6\u05dc\u05b6\u05d1',
    'w_chatul': '\u05d7\u05b8\u05ea\u05d5\u05bc\u05dc',
    'w_dag':    '\u05d3\u05bc\u05b8\u05d2',
    'w_para':   '\u05e4\u05bc\u05b8\u05e8\u05b8\u05d4',
    'w_ari':    '\u05d0\u05b2\u05e8\u05b4\u05d9',
    'w_sus':    '\u05e1\u05d5\u05bc\u05e1',
    'w_etz':    '\u05e2\u05b5\u05e5',
    'w_shemesh':'\u05e9\u05c1\u05b6\u05de\u05b6\u05e9\u05c1',
    'w_bayit':  '\u05d1\u05bc\u05b7\u05d9\u05b4\u05ea',
    'w_yad':    '\u05d9\u05b8\u05d3',
    'w_mayim':  '\u05de\u05b7\u05d9\u05b4\u05dd',
    'w_lechem': '\u05dc\u05b6\u05d7\u05b6\u05dd',
    'w_kadur':  '\u05db\u05bc\u05b7\u05d3\u05bc\u05d5\u05bc\u05e8',
    'w_oto':    '\u05d0\u05d5\u05b9\u05d8\u05d5\u05b9',
    'w_sefer':  '\u05e1\u05b5\u05e4\u05b6\u05e8',
    'w_tapuach':'\u05ea\u05bc\u05b7\u05e4\u05bc\u05d5\u05bc\u05d7\u05b7',
}

# Spoken on the start screen, where Alon picks what to play.
CATEGORIES = {
    'cat_count':  '\u05e1\u05e4\u05d9\u05e8\u05d4',
    'cat_recog':  '\u05de\u05e1\u05e4\u05e8\u05d9\u05dd',
    'cat_add':    '\u05d7\u05d9\u05d1\u05d5\u05e8',
    'cat_sub':    '\u05d7\u05d9\u05e1\u05d5\u05e8',
    'cat_letter': '\u05d0\u05d5\u05ea\u05d9\u05d5\u05ea',
    'cat_read':   '\u05e7\u05e8\u05d9\u05d0\u05d4',
    'cat_mixed':  '\u05d4\u05db\u05dc \u05de\u05e2\u05d5\u05e8\u05d1\u05d1',
}

MISC = {
    'pick_what': ('\u05de\u05d4 \u05e0\u05e9\u05d7\u05e7 \u05d4\u05d9\u05d5\u05dd?', LIVELY),
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
    for cid, text in LETTERS.items():
        clips[cid] = (text, SLOW)
    for cid, text in WORDS.items():
        clips[cid] = (text, SLOW)
    for cid, text in CATEGORIES.items():
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
