"""Spike-only analysis: candidate MeetFa paragraph-direction policies vs desired outcomes.
Uses Python's unicodedata Bidi_Class (UCD version printed). Not product code."""
import json, re, unicodedata, sys
S = json.load(open('samples.json'))
RTL, LTR = ('R', 'AL'), ('L',)
ISO_OPEN, PDI = ('\u2066', '\u2067', '\u2068'), '\u2069'

def strong_chars(t):
    out, depth = [], 0
    for ch in t:
        if ch in ISO_OPEN: depth += 1; continue
        if ch == PDI and depth: depth -= 1; continue
        if depth: continue
        b = unicodedata.bidirectional(ch)
        if b in RTL + LTR: out.append('r' if b in RTL else 'l')
    return out

def words(t):  # words = whitespace tokens; a word's class = class of its letters
    cls = []
    for w in t.split():
        s = strong_chars(w)
        if s: cls.append('r' if 'r' in s and s.count('r') >= s.count('l') else 'l')
    return cls

def share(xs):  # share of RTL among strong units; None if no strong units
    return None if not xs else xs.count('r') / len(xs)

def P1_first_strong(t):
    s = strong_chars(t); return 'rtl' if not s else ('rtl' if s[0] == 'r' else 'ltr')
def P2_any_rtl(t):
    s = strong_chars(t); return 'rtl' if (not s or 'r' in s) else 'ltr'
def word_share(th):
    def f(t):
        w = words(t); sh = share(w); return 'rtl' if sh is None or sh >= th else 'ltr'
    f.__name__ = f'P_word≥{int(th*100)}%'; return f
def letter_share(th):
    def f(t):
        sh = share(strong_chars(t)); return 'rtl' if sh is None or sh >= th else 'ltr'
    f.__name__ = f'P_letter≥{int(th*100)}%'; return f
def P_last_strong(t):
    s = strong_chars(t); return 'rtl' if not s else ('rtl' if s[-1] == 'r' else 'ltr')

POLICIES = [P1_first_strong, P2_any_rtl, word_share(.20), word_share(.30), word_share(.50),
            letter_share(.20), P_last_strong]
def ok(got, want):
    if want == '?': return '·'
    w = want.rstrip('?')
    return '✓' if got == w else '✗'

print('UCD', unicodedata.unidata_version)
rows = []
for s in S:
    w, l = words(s['text']), strong_chars(s['text'])
    r = {'id': s['id'], 'text': s['text'], 'want': s['want'],
         'rtl_word_share': None if share(w) is None else round(share(w), 3),
         'rtl_letter_share': None if share(l) is None else round(share(l), 3),
         'first_strong': l[0] if l else None}
    for p in POLICIES: r[p.__name__] = p(s['text'])
    rows.append(r)
json.dump(rows, open('policy-results.json', 'w'), ensure_ascii=False, indent=1)
names = [p.__name__ for p in POLICIES]
print('id  want  wordShare letterShare | ' + ' | '.join(names))
for r in rows:
    print(f"{r['id']:<4}{r['want']:<5} {str(r['rtl_word_share']):<9} {str(r['rtl_letter_share']):<11} | " +
          ' | '.join(f"{r[n]}{ok(r[n], r['want'])}" for n in names))
print('\nmismatches vs firm wants (rtl/ltr) and soft wants (ltr?):')
for n in names:
    firm = [r['id'] for r in rows if r['want'] in ('rtl', 'ltr') and r[n] != r['want']]
    soft = [r['id'] for r in rows if r['want'] == 'ltr?' and r[n] != 'ltr']
    print(f'  {n:<16} firm={firm} soft={soft}')
# threshold sweep for word share
print('\nword-share threshold sweep (firm + soft wants):')
for th in [x / 100 for x in range(5, 100, 5)]:
    f = word_share(th)
    firm = [r['id'] for r in rows if r['want'] in ('rtl', 'ltr') and f(r['text']) != r['want']]
    soft = [r['id'] for r in rows if r['want'] == 'ltr?' and f(r['text']) != 'ltr']
    print(f'  {th:.2f}: firm_fail={firm} soft_fail={soft}')
