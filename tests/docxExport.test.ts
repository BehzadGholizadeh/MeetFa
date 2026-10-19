import { describe, expect, it } from 'vitest';
import type { Session } from '../src/shared/types';
import { buildTranscript } from '../src/transcript/buildTranscript';
import {
  buildTranscriptDocx, EMPTY_TRANSCRIPT, PARTIAL_LABEL, sanitizeXmlText, STATUS_NOTE, TRANSCRIPT_HEADING, UNTITLED,
} from '../src/export/docx';
import { baseDirection, splitByDirection } from '../src/export/direction';
import { docxFileName, MAX_BASENAME } from '../src/export/filename';
import { bodyParagraphs, openDocx, paragraphs } from './docxHelpers';
import { largeFixture, SESSION, seg, shuffled } from './transcriptFixture';

const docxOf = (session: Session, segs: Parameters<typeof buildTranscript>[1]) => {
  const r = buildTranscriptDocx(buildTranscript(session, segs), { now: new Date(Date.UTC(2026, 9, 19)) });
  return { ...r, ...openDocx(r.bytes) };
};
const textParas = (doc: Document) => bodyParagraphs(doc).filter((p) => p.style !== 'Speaker');
const speakerParas = (doc: Document) => bodyParagraphs(doc).filter((p) => p.style === 'Speaker');

describe('DOCX package', () => {
  it('is a real ZIP (PK signature) with every required OOXML part, all well-formed', () => {
    const { bytes, parts } = docxOf(SESSION, [seg('A', 'سلام', 0)]);
    expect([...bytes.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect(Object.keys(parts).sort()).toEqual(
      ['[Content_Types].xml', '_rels/.rels', 'docProps/app.xml', 'docProps/core.xml', 'word/_rels/document.xml.rels', 'word/document.xml', 'word/styles.xml'].sort(),
    );
    expect(parts['[Content_Types].xml']).toContain('application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml');
    expect(parts['_rels/.rels']).toContain('Target="word/document.xml"');
    expect(parts['word/_rels/document.xml.rels']).toContain('Target="styles.xml"');
    expect(Object.keys(parts)[0]).toBe('[Content_Types].xml');
  });

  it('section is RTL and every style used by the document is defined', () => {
    const { parts, doc } = docxOf(SESSION, [seg('A', 'x', 0, { final: false })]);
    expect(parts['word/document.xml']).toMatch(/<w:sectPr>.*<w:bidi\/><\/w:sectPr>/);
    for (const s of new Set(paragraphs(doc).map((p) => p.style).filter(Boolean))) {
      expect(parts['word/styles.xml']).toContain(`w:styleId="${s}"`);
    }
  });

  it('header: title, start and end time, meet code, then the transcript heading', () => {
    const { doc, parts } = docxOf(SESSION, [seg('A', 'x', 0)]);
    const ps = paragraphs(doc);
    expect(ps[0]).toMatchObject({ style: 'Title', dir: 'rtl', text: SESSION.title });
    expect(ps.filter((p) => p.style === 'Meta').map((p) => p.text.split(':')[0])).toEqual(['شروع', 'پایان', 'کد جلسه']);
    expect(ps.find((p) => p.text.startsWith('کد جلسه'))!.text).toBe(`کد جلسه: ${SESSION.meetCode}`);
    expect(ps.find((p) => p.style === 'Heading1')!.text).toBe(TRANSCRIPT_HEADING);
    expect(parts['docProps/core.xml']).toContain(`<dc:title>${SESSION.title}</dc:title>`);
  });
});

describe('transcript content', () => {
  const segments = [
    seg('مریم احمدی', 'سلام به همه.', 0, { dur: 2_000 }),
    seg('مریم احمدی', 'جلسه رو شروع می‌کنیم.', 3_000),
    seg('John Smith', 'The deadline is Friday.', 6_000),
    seg('گوینده ۳', 'گزارش Q3 آماده است.', 9_000),
    seg('مریم احمدی', 'ممنون.', 12_000, { final: false }),
  ];

  it('several speakers and turns: one bold speaker line per turn, names exactly as stored', () => {
    const { doc } = docxOf(SESSION, segments);
    const sp = speakerParas(doc);
    expect(sp).toHaveLength(4);
    expect(sp.map((p) => p.runs.filter((r) => r.bold).map((r) => r.text).join(''))).toEqual(['مریم احمدی', 'John Smith', 'گوینده ۳', 'مریم احمدی']);
    // speaker name is visually separate from the text: own paragraph, bold, and the text runs are not bold
    expect(textParas(doc).every((p) => p.runs.every((r) => !r.bold))).toBe(true);
  });

  it('every paragraph of buildTranscript appears once, in order, with its text unchanged', () => {
    const { doc } = docxOf(SESSION, segments);
    expect(textParas(doc).map((p) => p.text)).toEqual(buildTranscript(SESSION, segments).turns.flatMap((t) => t.paragraphs.map((p) => p.text)));
  });

  it('keeps chronological order when storage returns segments shuffled', () => {
    const ordered = Array.from({ length: 30 }, (_, i) => seg(['A', 'B', 'ج'][i % 3], `متن ${i}`, i * 30_000));
    const { doc } = docxOf(SESSION, shuffled(ordered));
    expect(textParas(doc).map((p) => p.text)).toEqual(ordered.map((s) => s.text));
  });

  it('marks partial turns only in the speaker line, never in the text', () => {
    const { doc } = docxOf(SESSION, segments);
    const sp = speakerParas(doc);
    expect(sp.map((p) => p.text.endsWith(PARTIAL_LABEL))).toEqual([false, false, false, true]);
    expect(textParas(doc).at(-1)!.text).toBe('ممنون.');
  });

  it('Persian, English and mixed paragraphs get the P2 base direction', () => {
    const cases: [string, 'rtl' | 'ltr'][] = [
      ['سلام به همه، جلسه رو شروع می‌کنیم.', 'rtl'],
      ['The deadline is Friday, October 30.', 'ltr'],
      ['API در این سرویس استفاده می‌شود.', 'rtl'],
      ['این نسخه OpenAI v2.4.0 است.', 'rtl'],
      ['Please send the file to مریم by Friday.', 'rtl'],
      ['Срок сдачи — в пятницу.', 'ltr'],
      ['۱۴۰۵ / 2026', 'rtl'],
    ];
    for (const [text, dir] of cases) {
      const { doc } = docxOf(SESSION, [seg('A', text, 0)]);
      expect(textParas(doc)[0]).toMatchObject({ text, dir });
    }
  });

  it('mixed lines are split into script runs: w:rtl only on Persian runs, text unchanged', () => {
    const text = 'گزارش Q3 آماده است.';
    const { doc } = docxOf(SESSION, [seg('A', text, 0)]);
    const p = textParas(doc)[0];
    expect(p.runs.map((r) => [r.text, r.rtl])).toEqual([['گزارش ', true], ['Q3 ', false], ['آماده است.', true]]);
    expect(p.text).toBe(text);
  });

  it('special characters: XML escaped, ZWNJ/emoji kept, tab → w:tab, invalid code points → U+FFFD and counted', () => {
    const text = 'a & b < c > "d" \'e\' می‌شود 👋🏽\tتب \u0001 \uD800 ي/ی ك/ک';
    const { doc, replaced } = docxOf(SESSION, [seg('<b>x</b>', text, 0)]);
    expect(replaced).toBe(2);
    expect(textParas(doc)[0].text).toBe(text.replace('\u0001', '�').replace('\uD800', '�'));
    expect(speakerParas(doc)[0].runs.filter((r) => r.bold).map((r) => r.text).join('')).toBe('<b>x</b>');
  });

  it('an invalid code point in the title is counted once, though the title is written twice', () => {
    const { replaced, parts, doc } = docxOf({ ...SESSION, title: 'جلسه\u0001' }, [seg('A', 'x', 0)]);
    expect(replaced).toBe(1);
    expect(paragraphs(doc)[0].text).toBe('جلسه�');
    expect(parts['docProps/core.xml']).toContain('<dc:title>جلسه�</dc:title>');
  });

  it('line breaks inside a segment become w:br', () => {
    const { parts } = docxOf(SESSION, [seg('A', 'خط یک\nخط دو', 0)]);
    expect(parts['word/document.xml']).toContain('<w:br/>');
  });
});

describe('empty session and incomplete data', () => {
  it('no segments (or only blank ones) → a valid file that says so', () => {
    for (const segs of [[], [seg('A', '   ', 0)]]) {
      const { doc } = docxOf(SESSION, segs);
      expect(bodyParagraphs(doc).map((p) => p.text)).toEqual([EMPTY_TRANSCRIPT]);
    }
  });

  it('blank title, missing end time, missing meet code and invalid timestamps do not throw', () => {
    const broken = { ...SESSION, title: '   ', endedAt: undefined, meetCode: '', startedAt: Number.NaN } as Session;
    const s = { ...seg('A', 'متن', 0), startedAt: Number.NaN };
    const { doc } = docxOf(broken, [s]);
    const ps = paragraphs(doc);
    expect(ps[0].text).toBe(UNTITLED);
    expect(ps.some((p) => p.style === 'Meta')).toBe(false);
    expect(textParas(doc).map((p) => p.text)).toEqual(['متن']);
  });

  it('a blank speaker is omitted from the speaker line instead of showing an empty name', () => {
    const { doc } = docxOf(SESSION, [seg('  ', 'متن', 0)]);
    expect(speakerParas(doc)[0].runs.some((r) => r.bold)).toBe(false);
  });

  it('active and interrupted sessions carry a note', () => {
    for (const status of ['active', 'interrupted'] as const) {
      const { doc } = docxOf({ ...SESSION, status }, [seg('A', 'x', 0)]);
      expect(paragraphs(doc).some((p) => p.text === STATUS_NOTE[status])).toBe(true);
    }
  });
});

describe('large session', () => {
  it('3,000 segments build into a valid file with the full text', () => {
    const segs = largeFixture();
    const t = buildTranscript(SESSION, segs);
    const t0 = performance.now();
    const { bytes } = buildTranscriptDocx(t);
    const ms = performance.now() - t0;
    const { doc } = openDocx(bytes);
    expect(textParas(doc).map((p) => p.text)).toEqual(t.turns.flatMap((x) => x.paragraphs.map((p) => p.text)));
    expect(ms).toBeLessThan(5_000);
  });
});

describe('sanitizeXmlText', () => {
  it('keeps tab, LF, CR and valid surrogate pairs', () => {
    expect(sanitizeXmlText('a\tb\nc\rd 👋')).toEqual(['a\tb\nc\rd 👋', 0]);
    expect(sanitizeXmlText('\u0000￾\uDC00')).toEqual(['���', 3]);
  });
});

describe('direction policy P2', () => {
  it.each([
    ['سلام', 'rtl'], ['Hello', 'ltr'], ['API v2 در OpenAI SDK است.', 'rtl'], ['המועד', 'rtl'],
    ['Η προθεσμία', 'ltr'], ['2026', 'rtl'], ['👋🏽 ✅', 'rtl'], ['', 'rtl'], ['‌', 'rtl'],
  ] as const)('%j → %s', (text, dir) => expect(baseDirection(text)).toBe(dir));

  it('splitByDirection never changes the text', () => {
    for (const s of ['', '  ', '(نسخه 2.1)', '2026 سلام Hello، دنیا!', '👋🏽\tتب']) {
      expect(splitByDirection(s).map((p) => p.text).join('')).toBe(s);
    }
  });
});

describe('docxFileName', () => {
  const ts = new Date(2026, 9, 19, 10, 0).getTime();
  it.each([
    ['جلسهٔ هفتگی تیم', 'جلسهٔ هفتگی تیم.docx'],
    ['Weekly sync: Q3/Q4 <draft>?', 'Weekly sync Q3 Q4 draft.docx'],
    ['  گزارش  \t  "نهایی"  ', 'گزارش نهایی.docx'],
    ['a\\b|c*d', 'a b c d.docx'],
    ['...جلسه...', 'جلسه.docx'],
    ['‮txt.exe', 'txt.exe.docx'],
    ['می‌شود', 'می‌شود.docx'],
    ['CON', '_CON.docx'],
    ['nul.txt', '_nul.txt.docx'],
  ])('%j → %j', (title, name) => expect(docxFileName(title, ts)).toBe(name));

  it('empty, blank, only-invalid or non-string titles fall back to MeetFa-YYYY-MM-DD', () => {
    for (const t of ['', '   ', '<>:"/\\|?*', '‏‎', ' . . ', undefined, null, 42]) {
      expect(docxFileName(t, ts)).toBe('MeetFa-2026-10-19.docx');
    }
    expect(docxFileName('', Number.NaN)).toBe('MeetFa-transcript.docx');
  });

  it('long titles are cut on a grapheme boundary to MAX_BASENAME characters', () => {
    const long = 'جلسه '.repeat(40) + '👋🏽👋🏽';
    const name = docxFileName(long, ts);
    const base = name.slice(0, -'.docx'.length);
    expect([...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(base)].length).toBeLessThanOrEqual(MAX_BASENAME);
    expect(base).toBe(base.trim());
    expect(docxFileName('x'.repeat(78) + '👋🏽👋🏽👋🏽', ts)).toBe('x'.repeat(78) + '👋🏽👋🏽.docx');
  });
});
