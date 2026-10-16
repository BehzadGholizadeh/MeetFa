import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SegmentTracker } from '../src/content/segmentTracker';
import { CaptionObserver } from '../src/content/captionObserver';
import { parseCaptionRegion } from '../src/content/captionParser';
import { FINALIZE_IDLE_MS } from '../src/shared/constants';
import type { CaptureStatus, Segment } from '../src/shared/types';
import { makeSpikeRegion, spikeBlocks } from './fixtures';

/** متن زیرنویس بلوک iام در fixture ساختار واقعی */
const textEl = (i: number) => spikeBlocks()[i].querySelector('.ygicle')!;
/** متن کل جلسه از دید کاربر: ترکیب همه segmentهای ارسال‌شده (آخرین نسخه هر id) */
function transcript(all: Segment[]): string {
  const m = new Map<string, Segment>();
  all.forEach((s) => m.set(s.id, s));
  return [...m.values()].sort((a, b) => a.startedAt - b.startedAt).map((s) => s.text).join(' | ');
}

describe('بازتولید توقف دریافت: ادامه صحبت در همان بلوک بعد از سکوت', () => {
  it('Tracker: بعد از نهایی شدن با سکوت، متن جدید همان بلوک از دست نمی‌رود', () => {
    let t = 0;
    const tr = new SegmentTracker(() => t);
    const r = makeSpikeRegion();
    spikeBlocks()[0].remove(); // یک گوینده، یک بلوک (سناریوی تست دستی)
    const out: Segment[] = [];
    out.push(...tr.update(parseCaptionRegion(r)));

    t += FINALIZE_IDLE_MS;
    out.push(...tr.tick()); // سکوت ⇒ نهایی
    expect(out.at(-1)?.final).toBe(true);

    t += 500;
    textEl(0).textContent = 'ممنون، گزارش Q3 آماده است و فردا ارسال میشه';
    const changed = tr.update(parseCaptionRegion(r));
    out.push(...changed);
    expect(changed.length).toBeGreaterThan(0);
    expect(transcript(out)).toContain('فردا ارسال میشه');
    // بخش نهایی‌شده تکرار نمی‌شود
    expect(transcript(out).match(/گزارش Q3/g)).toHaveLength(1);
  });

  it('Tracker: چند چرخه سکوت/ادامه، و حذف ابتدای متن (scroll) بدون تکرار', () => {
    let t = 0;
    const tr = new SegmentTracker(() => t);
    const r = makeSpikeRegion();
    spikeBlocks()[0].remove();
    const out: Segment[] = [];
    const step = (text: string, pause = false) => {
      t += 300;
      textEl(0).textContent = text;
      out.push(...tr.update(parseCaptionRegion(r)));
      if (pause) {
        t += FINALIZE_IDLE_MS;
        out.push(...tr.tick());
      }
    };
    out.push(...tr.update(parseCaptionRegion(r)));
    step('ممنون، گزارش Q3 آماده است', true);
    step('ممنون، گزارش Q3 آماده است. بودجه هم تأیید شد', true);
    step('ممنون، گزارش Q3 آماده است. بودجه هم تأیید شد. جلسه بعد شنبه', true);
    // Meet ابتدای بلوک بلند را حذف می‌کند
    step('بودجه هم تأیید شد. جلسه بعد شنبه است. لطفاً حضور داشته باشید');
    const text = transcript(out);
    for (const w of ['گزارش Q3', 'بودجه هم تأیید شد', 'جلسه بعد شنبه', 'لطفاً حضور داشته باشید']) {
      expect(text.match(new RegExp(w, 'g'))?.length, w).toBe(1);
    }
  });

  it('Tracker: اصلاح متن نهایی‌شده بدون محتوای جدید ⇒ segment تکراری ساخته نمی‌شود', () => {
    let t = 0;
    const tr = new SegmentTracker(() => t);
    const r = makeSpikeRegion();
    spikeBlocks()[0].remove();
    tr.update(parseCaptionRegion(r));
    t += FINALIZE_IDLE_MS;
    tr.tick();
    textEl(0).textContent = 'ممنون، گزارش Q3 آماده است'; // همان متن
    expect(tr.update(parseCaptionRegion(r))).toHaveLength(0);
  });
});

describe('CaptionObserver (یکپارچه با DOM، تایمر قطعی)', () => {
  let segs: Segment[];
  let statuses: [CaptureStatus, string | undefined][];
  let obs: CaptionObserver;

  beforeEach(() => {
    vi.useFakeTimers();
    segs = [];
    statuses = [];
  });
  afterEach(() => {
    obs?.stop();
    vi.useRealTimers();
  });

  const start = (tracker?: SegmentTracker) => {
    obs = new CaptionObserver(
      { onSegments: (s) => segs.push(...s), onStatus: (st, d) => statuses.push([st, d]) },
      tracker,
    );
    obs.start();
  };
  const lastStatus = () => statuses.at(-1)?.[0];

  it('ادامه صحبت بعد از سکوت ۵ ثانیه‌ای به پنل می‌رسد (همان علامت گزارش تست دستی)', async () => {
    makeSpikeRegion();
    spikeBlocks()[0].remove();
    start();
    await vi.advanceTimersByTimeAsync(500);
    expect(transcript(segs)).toContain('گزارش Q3');

    await vi.advanceTimersByTimeAsync(5000); // سکوت
    textEl(0).textContent = 'ممنون، گزارش Q3 آماده است و فردا ارسال میشه';
    await vi.advanceTimersByTimeAsync(1000);
    expect(transcript(segs)).toContain('فردا ارسال میشه');
  });

  it('جایگزینی کامل ناحیه زیرنویس توسط Meet ⇒ observer به ناحیه جدید وصل می‌شود', async () => {
    makeSpikeRegion();
    start();
    await vi.advanceTimersByTimeAsync(500);
    // Meet ناحیه را دوباره می‌سازد (old حذف، new اضافه)
    makeSpikeRegion();
    textEl(1).textContent = 'متن بعد از ساخت دوباره ناحیه';
    await vi.advanceTimersByTimeAsync(1500);
    expect(transcript(segs)).toContain('متن بعد از ساخت دوباره ناحیه');
  });

  it('ناحیه جدید در حالی که ناحیه قدیمی هنوز در DOM است ⇒ اتصال به ناحیه فعال', async () => {
    const old = makeSpikeRegion();
    start();
    await vi.advanceTimersByTimeAsync(500);
    old.removeAttribute('aria-label'); // قدیمی پنهان/بی‌برچسب اما متصل
    const fresh = document.createElement('div');
    fresh.innerHTML = old.outerHTML;
    const region = fresh.firstElementChild as HTMLElement;
    region.setAttribute('aria-label', 'Captions');
    region.querySelectorAll('.ygicle')[1].textContent = 'متن در ناحیه تازه';
    document.body.appendChild(region);
    await vi.advanceTimersByTimeAsync(1500);
    expect(transcript(segs)).toContain('متن در ناحیه تازه');
  });

  it('وضعیت: دریافت → «در حال دریافت»، سکوت → «آماده/منتظر صحبت» (نه خطا)', async () => {
    makeSpikeRegion();
    start();
    await vi.advanceTimersByTimeAsync(500);
    expect(lastStatus()).toBe('capturing');
    await vi.advanceTimersByTimeAsync(60_000); // یک دقیقه سکوت
    expect(lastStatus()).toBe('ready');
    expect(statuses.some(([s]) => s === 'error')).toBe(false);
    textEl(1).textContent = 'دوباره صحبت';
    await vi.advanceTimersByTimeAsync(500);
    expect(lastStatus()).toBe('capturing');
  });

  it('وضعیت: متن Meet رشد می‌کند ولی چیزی ثبت نمی‌شود ⇒ خطای قابل‌تشخیص؛ با بازگشت دریافت، رفع', async () => {
    makeSpikeRegion();
    let broken = true;
    const real = new SegmentTracker();
    const stub = Object.assign(Object.create(SegmentTracker.prototype), {
      update: (b: Parameters<SegmentTracker['update']>[0]) => (broken ? [] : real.update(b)),
      tick: () => [],
      flushAll: () => [],
    }) as SegmentTracker;
    start(stub);
    for (let i = 0; i < 4; i++) {
      textEl(1).textContent += ` کلمه${i}`;
      await vi.advanceTimersByTimeAsync(400);
    }
    await vi.advanceTimersByTimeAsync(1000);
    expect(lastStatus()).toBe('error');
    expect(statuses.at(-1)?.[1]).toContain('ثبت نمی‌شود');

    broken = false;
    textEl(1).textContent += ' ادامه';
    await vi.advanceTimersByTimeAsync(1000);
    expect(lastStatus()).toBe('capturing');
  });
});
