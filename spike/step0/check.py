"""Step 0 automated DOCX checks (structure + text fidelity). Synthetic data only."""
import json, sys, zipfile, xml.etree.ElementTree as ET
W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
exp = json.load(open('out/expected.json'))
INVALID = lambda c: not (c in '\t\n\r' or 0x20 <= ord(c) <= 0xD7FF or 0xE000 <= ord(c) <= 0xFFFD or ord(c) >= 0x10000)

def sanitize(s): return ''.join('\uFFFD' if INVALID(c) or 0xD800 <= ord(c) <= 0xDFFF else c for c in s)

def para_texts(doc):
    out = []
    for p in doc.iter(W + 'p'):
        buf = []
        for el in p.iter():
            if el.tag == W + 't': buf.append(el.text or '')
            elif el.tag == W + 'tab': buf.append('\t')
        out.append((p, ''.join(buf)))
    return out

def check(path, kind):
    z = zipfile.ZipFile(path); r = {'file': path.split('/')[-1]}
    assert z.testzip() is None
    names = z.namelist()
    for need in ['[Content_Types].xml', '_rels/.rels', 'word/document.xml']:
        assert need in names, need
    for n in names:
        if n.endswith('.xml') or n.endswith('.rels'): ET.fromstring(z.read(n))  # well-formed
    doc = ET.fromstring(z.read('word/document.xml'))
    paras = para_texts(doc)
    r['paragraphs'] = len(paras)
    r['all_bidi'] = all(p.find(W + 'pPr') is not None and p.find(W + 'pPr').find(W + 'bidi') is not None for p, _ in paras)  # bidi element present (val may be 0 in auto mode)
    sect = doc.find(f'.//{W}sectPr')
    r['section_bidi'] = sect is not None and sect.find(W + 'bidi') is not None
    texts = [t for _, t in paras]
    r['fffd'] = sum(t.count('\uFFFD') for t in texts)
    # text invariant: transcript paragraphs (after speaker lines) equal expected, in order
    turns = exp['checks'] if kind == 'checks' else [{'paragraphs': p} for p in exp['large']['paragraphs']]
    expected = [sanitize(p) for t in turns for p in t['paragraphs']]
    body = texts[4:]  # title, date, time, heading
    if kind == 'checks':
        got = [t for t in body if ' · 14:3' not in t]
    else:
        got = [t for t in body if not (len(t) < 40 and ' · ' in t)]
    r['text_invariant'] = ' '.join(got) == ' '.join(expected)
    r['rtl_runs'] = sum(1 for _ in doc.iter(W + 'rtl'))
    r['bytes'] = sum(i.file_size for i in z.infolist())
    return r

rows = []
for f, k in [('hand-checks-A-single-run', 'checks'), ('hand-checks-B-split-runs', 'checks'), ('hand-checks-C-split-auto-dir', 'checks'), ('hand-checks-P2', 'checks'), ('hand-large', 'large'),
             ('lib-checks', 'checks'), ('lib-large', 'large')]:
    rows.append(check(f'out/{f}.docx', k))
ok = all(r['all_bidi'] and r['text_invariant'] for r in rows) and all(r['section_bidi'] for r in rows if r['file'].startswith('hand')) and all(r['fffd'] == 2 for r in rows if 'checks' in r['file'])
for r in rows: print(r)
json.dump(rows, open('out/check-results.json', 'w'), ensure_ascii=False, indent=1)
print('ALL PASS (section bidi required for hand path only; lib path reported)' if ok else 'FAILURES'); sys.exit(0 if ok else 1)
