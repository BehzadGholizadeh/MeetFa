import { describe, expect, it } from 'vitest';
import { buildTranscript, compareSegments } from '../src/transcript/buildTranscript';
import { PARAGRAPH_GAP_MS, PARAGRAPH_MAX_CHARS, TURN_GAP_MS } from '../src/transcript/constants';
import { SESSION, largeFixture, seg, shuffled } from './transcriptFixture';

const build = (segs: Parameters<typeof buildTranscript>[1]) => buildTranscript(SESSION, segs);
const shape = (segs: Parameters<typeof buildTranscript>[1]) =>
  build(segs).turns.map((t) => ({ speaker: t.speaker, paragraphs: t.paragraphs.map((p) => p.text) }));

describe('rule 1: order by startedAt, then id', () => {
  it('sorts out-of-order input', () => {
    const a = seg('A', 'دوم', 2_000, { id: 'b' });
    const b = seg('A', 'اول', 0, { id: 'a' });
    expect(build([a, b]).turns[0].paragraphs[0].text).toBe('اول دوم');
  });
  it('breaks startedAt ties by id (code-unit order)', () => {
    const x = seg('A', 'X', 0, { id: 'id-2' });
    const y = seg('A', 'Y', 0, { id: 'id-10' }); // "id-10" < "id-2" in code-unit order
    expect(build([x, y]).turns[0].paragraphs[0].segmentIds).toEqual(['id-10', 'id-2']);
    expect(compareSegments(y, x)).toBeLessThan(0);
  });
});

describe('rule 2–3: turns', () => {
  it('speaker change always starts a new turn: A → B → A within 2 s gives three turns', () => {
    expect(shape([seg('A', 'یک', 0, { dur: 500 }), seg('B', 'دو', 700, { dur: 500 }), seg('A', 'سه', 1_400, { dur: 500 })]))
      .toEqual([{ speaker: 'A', paragraphs: ['یک'] }, { speaker: 'B', paragraphs: ['دو'] }, { speaker: 'A', paragraphs: ['سه'] }]);
  });
  it('speaker comparison is exact (case and spacing matter)', () => {
    expect(build([seg('Ali', 'x', 0), seg('ali', 'y', 1_000)]).turns).toHaveLength(2);
    expect(build([seg('مریم', 'x', 0), seg('مریم ', 'y', 1_000)]).turns).toHaveLength(2);
  });
  it('turn gap: threshold − 1 ms stays, threshold starts a new turn', () => {
    const a = seg('A', 'x', 0, { dur: 1_000 });
    expect(build([a, seg('A', 'y', 1_000 + TURN_GAP_MS - 1)]).turns).toHaveLength(1);
    expect(build([a, seg('A', 'y', 1_000 + TURN_GAP_MS)]).turns).toHaveLength(2);
  });
  it('acceptance: A resumes after 10 s → one turn, one paragraph; 25 s → new paragraph; 120 s → new turn', () => {
    const first = seg('A', 'قبل', 0, { dur: 1_000 });
    expect(shape([first, seg('A', 'بعد', 11_000)])).toEqual([{ speaker: 'A', paragraphs: ['قبل بعد'] }]);
    expect(shape([first, seg('A', 'بعد', 26_000)])).toEqual([{ speaker: 'A', paragraphs: ['قبل', 'بعد'] }]);
    expect(shape([first, seg('A', 'بعد', 121_000)])).toEqual([{ speaker: 'A', paragraphs: ['قبل'] }, { speaker: 'A', paragraphs: ['بعد'] }]);
  });
  it('turn startedAt/endedAt: first startedAt and largest updatedAt', () => {
    const t = build([seg('A', 'x', 0, { dur: 9_000 }), seg('A', 'y', 2_000, { dur: 1_000 })]).turns[0];
    expect(t.startedAt).toBe(SESSION.startedAt);
    expect(t.endedAt).toBe(SESSION.startedAt + 9_000);
  });
});

describe('gap definition', () => {
  it('negative gap (overlap) counts as 0', () => {
    const t = build([seg('A', 'x', 0, { dur: 30_000 }), seg('A', 'y', 5_000)]);
    expect(t.turns).toHaveLength(1);
    expect(t.turns[0].paragraphs).toHaveLength(1);
  });
  it('gap is measured from the previous non-empty segment (empty ones are ignored)', () => {
    const t = build([seg('A', 'x', 0, { dur: 1_000 }), seg('A', '   ', 15_000, { dur: 1_000 }), seg('A', 'y', 1_000 + PARAGRAPH_GAP_MS)]);
    expect(t.turns[0].paragraphs.map((p) => p.text)).toEqual(['x', 'y']);
  });
});

describe('rule 4–5: paragraphs', () => {
  it('paragraph gap: threshold − 1 ms stays, threshold starts a new paragraph', () => {
    const a = seg('A', 'x', 0, { dur: 1_000 });
    expect(build([a, seg('A', 'y', 1_000 + PARAGRAPH_GAP_MS - 1)]).turns[0].paragraphs).toHaveLength(1);
    expect(build([a, seg('A', 'y', 1_000 + PARAGRAPH_GAP_MS)]).turns[0].paragraphs).toHaveLength(2);
  });
  it('soft limit: breaks after sentence punctuation once the paragraph reaches the limit', () => {
    for (const p of ['.', '؟', '?', '!']) {
      const long = 'ا'.repeat(PARAGRAPH_MAX_CHARS - 1) + p; // exactly PARAGRAPH_MAX_CHARS code points
      const t = build([seg('A', long, 0), seg('A', 'بعدی', 1_000)]);
      expect(t.turns[0].paragraphs.map((x) => x.text)).toEqual([long, 'بعدی']);
    }
  });
  it('soft limit: below the limit, punctuation alone does not break', () => {
    const t = build([seg('A', 'جمله.', 0), seg('A', 'بعدی', 1_000)]);
    expect(t.turns[0].paragraphs).toHaveLength(1);
  });
  it('soft limit: a 5,000-character run without punctuation stays one paragraph', () => {
    const parts = Array.from({ length: 50 }, (_, i) => seg('A', 'و'.repeat(99), i * 1_100));
    const t = build(parts);
    expect(t.turns[0].paragraphs).toHaveLength(1);
    expect([...t.turns[0].paragraphs[0].text].length).toBe(50 * 99 + 49);
  });
  it('soft limit: never splits inside a segment', () => {
    const huge = 'ب'.repeat(PARAGRAPH_MAX_CHARS * 3) + '.';
    const t = build([seg('A', huge, 0)]);
    expect(t.turns[0].paragraphs.map((p) => p.text)).toEqual([huge]);
  });
  it('soft limit counts Unicode code points, not UTF-16 units', () => {
    // 600 emoji = 600 code points (1,200 UTF-16 units): below the limit, so no break
    const t = build([seg('A', '😀'.repeat(599) + '.', 0), seg('A', 'x', 1_000)]);
    expect(t.turns[0].paragraphs).toHaveLength(1);
  });
});

describe('rule 6: join without changing words', () => {
  it('joins with exactly one U+0020 and keeps overlap at a seam', () => {
    const t = build([seg('A', 'گزارش آماده', 0), seg('A', 'آماده است', 1_000)]);
    expect(t.turns[0].paragraphs[0].text).toBe('گزارش آماده آماده است');
  });
  it('keeps every character of segment text (ZWNJ, mixed script, leading/trailing spaces)', () => {
    const texts = ['می‌خواهم API v2.4.0 را', '  فاصله  ', '👋🏽 ✅'];
    const t = build(texts.map((x, i) => seg('A', x, i * 1_000)));
    expect(t.turns[0].paragraphs[0].text).toBe(texts.join(' '));
  });
});

describe('rule 7: partial turns', () => {
  it('a turn with any non-final segment is partial', () => {
    const t = build([seg('A', 'x', 0), seg('A', 'y', 1_000, { final: false }), seg('B', 'z', 2_000)]);
    expect(t.turns.map((x) => x.partial)).toEqual([true, false]);
  });
});

describe('empty input and blank segments', () => {
  it('no segments → empty transcript', () => {
    expect(build([])).toEqual({ session: SESSION, speakers: [], turns: [], stats: { segmentCount: 0, turnCount: 0, charCount: 0, durationMs: 0 } });
  });
  it('blank segments are skipped and not counted; speaker of a blank segment is not listed', () => {
    const t = build([seg('X', '', 0), seg('Y', ' \t\u00a0', 100), seg('A', 'x', 200)]);
    expect(t.speakers).toEqual(['A']);
    expect(t.stats.segmentCount).toBe(1);
  });
  it('ZWNJ-only text is not blank (kept as written)', () => {
    expect(build([seg('A', '\u200c', 0)]).turns).toHaveLength(1);
  });
});

describe('speakers and stats', () => {
  it('speakers in order of first appearance, stored names unchanged', () => {
    const t = build([seg('نامشخص', 'x', 0), seg('John Smith', 'y', 1_000), seg('نامشخص', 'z', 2_000)]);
    expect(t.speakers).toEqual(['نامشخص', 'John Smith']);
  });
  it('stats: code points, counts and duration', () => {
    const t = build([seg('A', 'ab', 0, { dur: 500 }), seg('B', '😀', 10_000, { dur: 2_000 })]);
    expect(t.stats).toEqual({ segmentCount: 2, turnCount: 2, charCount: 3, durationMs: 12_000 });
  });
  it('session is passed through unchanged', () => {
    expect(build([]).session).toBe(SESSION);
  });
});

describe('purity and determinism', () => {
  it('does not mutate the input array or its segments', () => {
    const input = [seg('A', 'y', 1_000), seg('A', 'x', 0)];
    const before = structuredClone(input);
    build(input);
    expect(input).toEqual(before);
  });
  it('shuffled input gives an identical result', () => {
    const fx = largeFixture();
    expect(buildTranscript(SESSION, shuffled(fx))).toEqual(buildTranscript(SESSION, fx));
  });
});

describe('large fixture: text invariant', () => {
  const fx = largeFixture();
  const t = buildTranscript(SESSION, fx);
  it('fixture size is as specified', () => {
    expect(fx).toHaveLength(3_000);
    expect(fx.reduce((n, s) => n + [...s.text].length, 0)).toBeGreaterThanOrEqual(400_000);
    expect(t.speakers).toHaveLength(3);
  });
  it('paragraph texts joined with one space equal the sorted non-empty segment texts joined with one space', () => {
    const fromTranscript = t.turns.flatMap((x) => x.paragraphs.map((p) => p.text)).join(' ');
    const fromSegments = fx.filter((s) => s.text.trim()).sort(compareSegments).map((s) => s.text).join(' ');
    expect(fromTranscript).toBe(fromSegments);
  });
  it('every segment id appears exactly once, in sorted order', () => {
    const ids = t.turns.flatMap((x) => x.paragraphs.flatMap((p) => p.segmentIds));
    expect(ids).toEqual(fx.slice().sort(compareSegments).map((s) => s.id));
  });
  it('the fixture exercises turn breaks, paragraph breaks and soft-limit breaks', () => {
    const paragraphs = t.turns.flatMap((x) => x.paragraphs);
    expect(t.turns.length).toBeGreaterThan(700);
    expect(paragraphs.length).toBeGreaterThan(t.turns.length);
  });
});
