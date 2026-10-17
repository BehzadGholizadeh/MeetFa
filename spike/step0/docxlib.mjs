// Fallback path: docx@9.8.1 (pinned). Same content and rules as ooxml.mjs.
import { Document, Packer, Paragraph, TextRun, Tab, HeadingLevel } from 'docx';
import { sanitize, firstStrongIsRtl } from './ooxml.mjs';

function runsOf(text, opts = {}) {
  const parts = text.split('\t');
  const rtl = firstStrongIsRtl(text);
  const out = [];
  parts.forEach((p, i) => {
    if (i > 0) out.push(new TextRun({ children: [new Tab()], rightToLeft: rtl }));
    out.push(new TextRun({ text: p, rightToLeft: rtl, font: { cs: 'Tahoma' }, ...opts }));
  });
  return out;
}
export async function buildDocxLib({ meta, turns }) {
  let replaced = 0;
  const clean = (s) => { const [t, n] = sanitize(s); replaced += n; return t; };
  const children = [
    new Paragraph({ bidirectional: true, heading: HeadingLevel.TITLE, children: runsOf(clean(meta.title)) }),
    new Paragraph({ bidirectional: true, children: runsOf(clean(`تاریخ: ${meta.date}`), { color: '555555' }) }),
    new Paragraph({ bidirectional: true, children: runsOf(clean(`زمان: ${meta.time}`), { color: '555555' }) }),
    new Paragraph({ bidirectional: true, heading: HeadingLevel.HEADING_1, children: runsOf('متن جلسه') }),
  ];
  for (const t of turns) {
    children.push(new Paragraph({ bidirectional: true, keepNext: true,
      children: [...runsOf(clean(t.speaker), { bold: true }), new TextRun({ text: ' · ' + t.time, color: '777777' })] }));
    for (const p of t.paragraphs) children.push(new Paragraph({ bidirectional: true, children: runsOf(clean(p)) }));
  }
  const doc = new Document({ creator: 'MeetFa', title: clean(meta.title),
    sections: [{ properties: { page: { size: { width: 11906, height: 16838 } } }, children }] });
  return { bytes: new Uint8Array(await Packer.toBuffer(doc)), replaced };
}
