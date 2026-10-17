"""Spike-only: each sample twice (base RTL, base LTR) in one DOCX for visual comparison.
Rendering is done by the viewer's Unicode Bidi Algorithm; MeetFa only chooses the base direction."""
import json, zipfile
from xml.sax.saxutils import escape
S = json.load(open('samples.json'))
W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
def run(t, rtl=False, color=None, sz=None):
    rpr = '<w:rFonts w:ascii="Noto Sans" w:hAnsi="Noto Sans" w:cs="Noto Sans Arabic"/>'
    if color: rpr += f'<w:color w:val="{color}"/>'
    if sz: rpr += f'<w:sz w:val="{sz}"/><w:szCs w:val="{sz}"/>'
    if rtl: rpr += '<w:rtl/>'
    return f'<w:r><w:rPr>{rpr}</w:rPr><w:t xml:space="preserve">{escape(t)}</w:t></w:r>'
def para(inner, bidi, border=False):
    b = '<w:pBdr><w:top w:val="single" w:sz="4" w:space="1" w:color="BBBBBB"/></w:pBdr>' if border else ''
    return f'<w:p><w:pPr>{b}<w:bidi w:val="{1 if bidi else 0}"/><w:spacing w:after="40"/></w:pPr>{inner}</w:p>'
body = []
for s in S:
    body.append(para(run(f"{s['id']}  (want: {s['want']})", color='888888', sz=16), False, border=True))
    for base in ('RTL', 'LTR'):
        body.append(para(run(f'base {base}:', color='2F6FB3', sz=16), False))
        body.append(para(run(s['text'], rtl=(base == 'RTL'), sz=24), base == 'RTL'))
doc = f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="{W}"><w:body>{"".join(body)}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="720" w:right="1080" w:bottom="720" w:left="1080" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr></w:body></w:document>'
ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'
rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'
with zipfile.ZipFile('direction-samples.docx', 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('[Content_Types].xml', ct); z.writestr('_rels/.rels', rels); z.writestr('word/document.xml', doc)
print('direction-samples.docx written')
