import type { Session, StoredSegment } from '../src/shared/types';

/** Synthetic data only — no real meeting content. */
export const SESSION: Session = {
  id: 'sess-1', title: 'جلسهٔ آزمایشی', meetCode: 'abc-defg-hij',
  startedAt: 1_800_000_000_000, endedAt: 1_800_010_800_000, status: 'ended', segmentCount: 0,
};

let n = 0;
/** Segment helper: t = startedAt offset (ms) from SESSION.startedAt; dur = updatedAt − startedAt */
export function seg(speaker: string, text: string, t: number, opts: { dur?: number; final?: boolean; id?: string } = {}): StoredSegment {
  const startedAt = SESSION.startedAt + t;
  return {
    id: opts.id ?? `s${String(n++).padStart(5, '0')}`,
    sessionId: SESSION.id, speaker, text, startedAt,
    updatedAt: startedAt + (opts.dur ?? 1_000), final: opts.final ?? true,
  };
}

/** Deterministic large fixture: 3,000 segments, ≥ 400,000 characters, 3 speakers, ~3 hours. */
export function largeFixture(): StoredSegment[] {
  const words = ['جلسه', 'گزارش', 'بودجه', 'برنامه', 'پروژه', 'تیم', 'مشتری', 'فروش', 'هفته', 'بعد', 'لطفاً',
    'بررسی', 'می‌کنیم', 'انجام', 'شد', 'است', 'Q3', 'API', 'dashboard', '۱۴۰۵', '2026', 'و', 'در', 'با', 'برای', 'که'];
  const speakers = ['مریم احمدی', 'John Smith', 'گوینده ۳'];
  let r = 7;
  const rnd = () => (r = (r * 1103515245 + 12345) % 2147483648) / 2147483648;
  const out: StoredSegment[] = [];
  let t = 0;
  for (let i = 0; i < 3000; i++) {
    let text = '';
    while (text.length < 131) text += (text ? ' ' : '') + words[Math.floor(rnd() * words.length)];
    if (rnd() < 0.3) text += '.';
    const speaker = speakers[Math.floor(i / 4) % 3];
    const pause = rnd() < 0.05 ? 25_000 : rnd() < 0.01 ? 130_000 : 600;
    out.push(seg(speaker, text, t, { dur: 2_800, id: `L${String(i).padStart(5, '0')}` }));
    t += 2_800 + pause;
  }
  return out;
}

/** Fisher–Yates with a fixed seed. */
export function shuffled<T>(xs: readonly T[], seed = 99): T[] {
  const a = xs.slice();
  let r = seed;
  for (let i = a.length - 1; i > 0; i--) {
    r = (r * 1103515245 + 12345) % 2147483648;
    const j = r % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
