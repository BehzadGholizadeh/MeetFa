import { strToU8, zipSync } from 'fflate';
import type { Transcript } from '../transcript/types';
import { baseDirection, splitByDirection, type Direction } from './direction';

/**
 * Word export (Stage 3, Step 4): hand-written WordprocessingML zipped with fflate.
 * Same document structure as the spike's candidate exporter (docs/spike-docx.md, variant C + policy P2):
 * RTL section and headers, P2 base direction per transcript paragraph, runs split by script.
 * Text is written exactly as given; only XML-invalid code points become U+FFFD.
 */

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export const UNTITLED = 'جلسهٔ بدون عنوان';
export const EMPTY_TRANSCRIPT = 'این جلسه متنی ندارد.';
export const TRANSCRIPT_HEADING = 'متن جلسه';
export const PARTIAL_LABEL = '(ناتمام)';
export const STATUS_NOTE = {
  active: 'این جلسه هنگام ساخت فایل هنوز در حال ضبط بود؛ متن تا همان لحظه است.',
  interrupted: 'ضبط این جلسه ناگهانی قطع شده است؛ ممکن است بخشی از متن ثبت نشده باشد.',
} as const;

const dateTimeFmt = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'full', timeStyle: 'short' });
const timeFmt = new Intl.DateTimeFormat('fa-IR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

const isTime = (t: unknown): t is number => typeof t === 'number' && Number.isFinite(t) && Math.abs(t) <= 8.64e15;

/** XML 1.0 invalid code points (C0 controls except tab/LF/CR, U+FFFE/U+FFFF, lone surrogates) → U+FFFD. */
const INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

export function sanitizeXmlText(s: string): [text: string, replaced: number] {
  let n = 0;
  const out = s.replace(INVALID_XML, () => (n++, '�'));
  return [out, n];
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

interface RunStyle {
  bold?: boolean;
  color?: string;
}

/** One run's text: tabs → <w:tab/>, line breaks → <w:br/>. */
function runBody(text: string): string {
  return text
    .split(/\r\n|\r|\n/)
    .map((line) => line.split('\t').map((t) => `<w:t xml:space="preserve">${esc(t)}</w:t>`).join('<w:tab/>'))
    .join('<w:br/>');
}

/** Runs split by script; `w:rtl` only on RTL pieces, neutral pieces follow the paragraph's base direction. */
function runs(text: string, base: Direction, style: RunStyle = {}): string {
  return splitByDirection(text)
    .map((piece) => {
      const rtl = (piece.dir ?? base) === 'rtl';
      const rPr =
        (style.bold ? '<w:b/><w:bCs/>' : '') + (style.color ? `<w:color w:val="${style.color}"/>` : '') + (rtl ? '<w:rtl/>' : '');
      return `<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ''}${runBody(piece.text)}</w:r>`;
    })
    .join('');
}

function para(inner: string, base: Direction, style?: string): string {
  const pPr = (style ? `<w:pStyle w:val="${style}"/>` : '') + (base === 'rtl' ? '<w:bidi/>' : '<w:bidi w:val="0"/>');
  return `<w:p><w:pPr>${pPr}</w:pPr>${inner}</w:p>`;
}

export interface DocxResult {
  bytes: Uint8Array;
  /** number of XML-invalid code points replaced with U+FFFD */
  replaced: number;
}

/** Builds a .docx from a transcript. Pure apart from reading `now` (core.xml creation date). */
export function buildTranscriptDocx(transcript: Transcript, opts: { now?: Date } = {}): DocxResult {
  const { session, turns } = transcript;
  let replaced = 0;
  const clean = (s: string) => {
    const [t, n] = sanitizeXmlText(s);
    replaced += n;
    return t;
  };
  const body: string[] = [];
  /** Header lines stay RTL (spike F4); only transcript paragraphs use P2. */
  const header = (text: string, style?: string, run: RunStyle = {}) => body.push(para(runs(clean(text), 'rtl', run), 'rtl', style));

  const title = typeof session.title === 'string' && session.title.trim() ? session.title : UNTITLED;
  header(title, 'Title');
  if (isTime(session.startedAt)) header(`شروع: ${dateTimeFmt.format(session.startedAt)}`, 'Meta');
  if (isTime(session.endedAt)) header(`پایان: ${dateTimeFmt.format(session.endedAt)}`, 'Meta');
  if (typeof session.meetCode === 'string' && session.meetCode.trim()) header(`کد جلسه: ${session.meetCode}`, 'Meta');
  if (session.status === 'active' || session.status === 'interrupted') header(STATUS_NOTE[session.status], 'Meta');
  header(TRANSCRIPT_HEADING, 'Heading1');

  if (!turns.length) header(EMPTY_TRANSCRIPT);
  for (const turn of turns) {
    // Speaker shown exactly as stored (renaming speakers is a later step); omitted only when blank.
    const speaker = typeof turn.speaker === 'string' && turn.speaker.trim() ? clean(turn.speaker) : '';
    let line = speaker ? runs(speaker, 'rtl', { bold: true }) : '';
    if (isTime(turn.startedAt)) line += runs(`${speaker ? ' · ' : ''}${timeFmt.format(turn.startedAt)}`, 'rtl', { color: '6B7280' });
    if (turn.partial) line += runs(` ${PARTIAL_LABEL}`, 'rtl', { color: 'C0392B' });
    if (line) body.push(para(line, 'rtl', 'Speaker'));
    for (const p of turn.paragraphs) {
      const text = clean(p.text);
      const base = baseDirection(text);
      body.push(para(runs(text, base), base));
    }
  }

  const document =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<w:document xmlns:w="${W}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${body.join('')}` +
    `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/><w:bidi/></w:sectPr>` +
    `</w:body></w:document>`;
  const created = (opts.now ?? new Date()).toISOString().replace(/\.\d+Z$/, 'Z');
  const core =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
    `<dc:title>${esc(clean(title))}</dc:title><dc:creator>MeetFa</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${created}</dcterms:created></cp:coreProperties>`;

  const files: Record<string, string> = {
    '[Content_Types].xml': CONTENT_TYPES,
    '_rels/.rels': ROOT_RELS,
    'word/_rels/document.xml.rels': DOCUMENT_RELS,
    'word/document.xml': document,
    'word/styles.xml': STYLES,
    'docProps/core.xml': core,
    'docProps/app.xml': APP,
  };
  const bytes = zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])), { level: 6 });
  return { bytes, replaced };
}

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

const CONTENT_TYPES =
  XML_DECL +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
  '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
  '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
  '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
  '</Types>';

const ROOT_RELS =
  XML_DECL +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
  '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
  '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' +
  '</Relationships>';

const DOCUMENT_RELS =
  XML_DECL +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
  '</Relationships>';

/** Calibri for Latin, Tahoma for complex script (ships with Windows; spike F3). */
const STYLES =
  XML_DECL +
  `<w:styles xmlns:w="${W}">` +
  '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Tahoma"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:rPrDefault>' +
  '<w:pPrDefault><w:pPr><w:bidi/><w:spacing w:after="120" w:line="300" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
  '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
  '<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="120"/></w:pPr><w:rPr><w:b/><w:bCs/><w:sz w:val="36"/><w:szCs w:val="36"/></w:rPr></w:style>' +
  '<w:style w:type="paragraph" w:styleId="Meta"><w:name w:val="MeetFa Meta"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="40"/></w:pPr><w:rPr><w:color w:val="555555"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:style>' +
  '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:bCs/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr></w:style>' +
  '<w:style w:type="paragraph" w:styleId="Speaker"><w:name w:val="MeetFa Speaker"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="60"/></w:pPr></w:style>' +
  '</w:styles>';

const APP =
  XML_DECL +
  '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>MeetFa</Application></Properties>';
