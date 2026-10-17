// Hand-written WordprocessingML (candidate path). Zip via fflate (no other deps).
import { zipSync, strToU8 } from './vendor/fflate.js';

const RTL = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;
const LTR = /[A-Za-z\u00C0-\u024F]/;
const STRONG = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFFA-Za-z\u00C0-\u024F]/;
export const firstStrongIsRtl = (s) => { const m = s.match(STRONG); return !!m && RTL.test(m[0]); };

/** XML 1.0 invalid code points (incl. lone surrogates) -> U+FFFD; returns [text, replacedCount] */
export function sanitize(s) {
  let n = 0;
  const out = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, () => (n++, '\uFFFD'));
  return [out, n];
}
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** text -> run XML; tabs become <w:tab/>; mode 'single' = one run, 'split' = runs split by script */
function runs(text, { bold = false, color = null, mode = 'single', lang = null } = {}) {
  const pieces = mode === 'split' ? splitByScript(text) : [text];
  return pieces.map((p) => {
    const rtl = firstStrongIsRtl(p) || (!LTR.test(p) && firstStrongIsRtl(text));
    const rPr = [
      '<w:rFonts w:cs="Tahoma"/>',
      bold ? '<w:b/><w:bCs/>' : '',
      color ? `<w:color w:val="${color}"/>` : '',
      rtl ? '<w:rtl/>' : '',
      lang ? `<w:lang w:bidi="${lang}"/>` : '',
    ].join('');
    const body = p.split('\t').map((t) => `<w:t xml:space="preserve">${esc(t)}</w:t>`).join('<w:tab/>');
    return `<w:r><w:rPr>${rPr}</w:rPr>${body}</w:r>`;
  }).join('');
}
/** split into maximal script runs; neutrals stay with the preceding run */
function splitByScript(text) {
  const out = []; let cur = ''; let dir = null;
  for (const ch of text) {
    const d = RTL.test(ch) ? 'r' : LTR.test(ch) ? 'l' : null;
    if (d && dir && d !== dir) { out.push(cur); cur = ''; }
    if (d) dir = d;
    cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}
const para = (inner, style, rtl = true) => `<w:p><w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ''}${rtl ? '<w:bidi/>' : '<w:bidi w:val="0"/>'}</w:pPr>${inner}</w:p>`;

/** paraDir 'rtl': every paragraph RTL; 'auto': transcript paragraphs follow their first strong character (like dir="auto") */
export function buildDocx({ meta, turns }, { mode = 'single', lang = null, paraDir = 'rtl' } = {}) {
  let replaced = 0;
  const clean = (s) => { const [t, n] = sanitize(s); replaced += n; return t; };
  const body = [];
  body.push(para(runs(clean(meta.title), { mode, lang }), 'Title'));
  body.push(para(runs(clean(`تاریخ: ${meta.date}`), { mode, lang, color: '555555' })));
  body.push(para(runs(clean(`زمان: ${meta.time}`), { mode, lang, color: '555555' })));
  body.push(para(runs('متن جلسه', { mode, lang }), 'Heading1'));
  for (const t of turns) {
    body.push(para(runs(clean(t.speaker), { bold: true, mode, lang }) + runs(' · ' + t.time, { color: '777777', mode: 'single' }), 'Speaker'));
    for (const p of t.paragraphs) {
      const c = clean(p);
      body.push(para(runs(c, { mode, lang }), null, paraDir === 'auto' ? firstStrongIsRtl(c) || !/[A-Za-z]/.test(c) : true));
    }
  }
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${body.join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/><w:bidi/></w:sectPr></w:body></w:document>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Tahoma"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:bidi/><w:spacing w:after="120" w:line="300" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="240"/></w:pPr><w:rPr><w:b/><w:bCs/><w:sz w:val="36"/><w:szCs w:val="36"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:bCs/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Speaker"><w:name w:val="MeetFa Speaker"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="200" w:after="60"/></w:pPr></w:style>
</w:styles>`;
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const files = {
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`,
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`,
    'word/_rels/document.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    'word/document.xml': document,
    'word/styles.xml': styles,
    'docProps/core.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(clean(meta.title))}</dc:title><dc:creator>MeetFa</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created></cp:coreProperties>`,
    'docProps/app.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>MeetFa</Application></Properties>`,
  };
  const zipped = zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])), { level: 6 });
  return { bytes: zipped, replaced };
}
