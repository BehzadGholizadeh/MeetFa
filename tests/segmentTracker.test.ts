import { describe, expect, it } from 'vitest';
import { mergeText, SegmentTracker } from '../src/content/segmentTracker';
import { parseCaptionRegion } from '../src/content/captionParser';
import { findCaptionRegion } from '../src/content/selectors';
import { addBlock, makeRegion, makeSpikeRegion, setText, spikeBlocks } from './fixtures';

describe('mergeText', () => {
  it('رشد متن', () => expect(mergeText('hello every', 'hello everyone today')).toBe('hello everyone today'));
  it('اصلاح انتهای متن توسط ASR', () =>
    expect(mergeText('we will meat at five', 'we will meet at five')).toBe('we will meet at five'));
  it('حذف ابتدای متن (scroll) بدون از دست رفتن', () => {
    const prev = 'first sentence here. second sentence is longer and keeps going';
    const next = 'second sentence is longer and keeps going with more words';
    expect(mergeText(prev, next)).toBe('first sentence here. ' + next);
  });
  it('متن جدید زیرمجموعه قبلی', () => expect(mergeText('a long caption text', 'caption')).toBe('a long caption text'));
  it('بدون تکرار در تکرار یکسان', () => expect(mergeText('same', 'same')).toBe('same'));
});

describe('selectors', () => {
  it('ناحیه با برچسب انگلیسی', () => { makeRegion('Captions'); expect(findCaptionRegion()).not.toBeNull(); });
  it('ناحیه با برچسب فارسی (با نیم‌فاصله)', () => { makeRegion('زیرنویس‌ها'); expect(findCaptionRegion()).not.toBeNull(); });
  it('برچسب نامرتبط', () => { makeRegion('Chat'); expect(findCaptionRegion()).toBeNull(); });
});

describe('parser', () => {
  it('گوینده و متن جدا می‌شوند؛ دکمه نادیده گرفته می‌شود', () => {
    const r = makeRegion();
    addBlock(r, 'Ali', 'salam be hame');
    addBlock(r, 'Sara', 'hi there');
    const blocks = parseCaptionRegion(r);
    expect(blocks.map((b) => [b.speaker, b.text])).toEqual([['Ali', 'salam be hame'], ['Sara', 'hi there']]);
  });
});

describe('SegmentTracker', () => {
  it('جریان کامل: رشد → اصلاح → بلوک جدید → حذف → بدون تکرار', () => {
    let t = 0;
    const tr = new SegmentTracker(() => t);
    const r = makeRegion();
    const b1 = addBlock(r, 'Ali', 'hello');

    expect(tr.update(parseCaptionRegion(r))).toHaveLength(1);
    t += 300; setText(b1, 'hello every');
    t += 300; setText(b1, 'hello everyone, we will meat');
    let ch = tr.update(parseCaptionRegion(r));
    t += 300; setText(b1, 'hello everyone, we will meet at five');
    ch = tr.update(parseCaptionRegion(r));
    expect(ch[0].text).toBe('hello everyone, we will meet at five');

    // تغییر نکرده ⇒ خروجی خالی (بدون ارسال تکراری)
    expect(tr.update(parseCaptionRegion(r))).toHaveLength(0);

    // بلوک جدید + گذشت زمان ⇒ بلوک قبلی نهایی
    t += 2000; addBlock(r, 'Sara', 'ok');
    ch = tr.update(parseCaptionRegion(r));
    expect(ch.find((s) => s.speaker === 'Ali')?.final).toBe(true);
    expect(ch.find((s) => s.speaker === 'Sara')?.final).toBe(false);

    // حذف بلوک از DOM ⇒ دیگر دوباره ظاهر نمی‌شود
    b1.remove();
    ch = tr.update(parseCaptionRegion(r));
    expect(ch.some((s) => s.speaker === 'Ali')).toBe(false);

    // سکوت ⇒ نهایی
    t += 5000;
    expect(tr.tick().map((s) => s.final)).toEqual([true]);
  });

  it('flushAll همه را نهایی می‌کند', () => {
    const tr = new SegmentTracker(() => 0);
    const r = makeRegion();
    addBlock(r, 'A', 'x y z');
    tr.update(parseCaptionRegion(r));
    expect(tr.flushAll().every((s) => s.final)).toBe(true);
  });
});

describe('جلسات فارسی', () => {
  it('رشد متن فارسی با نیم‌فاصله', () =>
    expect(mergeText('سلام به همه', 'سلام به همه‌ی دوستان عزیز')).toBe('سلام به همه‌ی دوستان عزیز'));
  it('اصلاح کلمه وسط جمله توسط ASR', () =>
    expect(mergeText('جلسه رو ساعت پنج شروع میکنیم', 'جلسه رو ساعت پنج شروع می‌کنیم')).toBe('جلسه رو ساعت پنج شروع می‌کنیم'));
  it('حذف ابتدای متن بلند فارسی بدون از دست رفتن', () => {
    const prev = 'جمله اول اینجاست. جمله دوم طولانی‌تر است و ادامه دارد';
    const next = 'جمله دوم طولانی‌تر است و ادامه دارد با کلمات بیشتر';
    expect(mergeText(prev, next)).toBe('جمله اول اینجاست. ' + next);
  });
  it('نام گوینده فارسی و متن مخلوط فارسی/انگلیسی', () => {
    const r = makeRegion('زیرنویس‌ها');
    addBlock(r, 'مریم احمدی', 'گزارش Q3 آماده است');
    expect(parseCaptionRegion(r).map((b) => [b.speaker, b.text])).toEqual([['مریم احمدی', 'گزارش Q3 آماده است']]);
  });
});

describe('ساختار واقعی spike (Persian (Iran))', () => {
  const expected = [
    ['گوینده ۱', 'سلام به همه، جلسه رو شروع می‌کنیم'],
    ['گوینده ۲', 'ممنون، گزارش Q3 آماده است'],
  ];

  it('ناحیه با aria-label="Captions" در جلسه فارسی', () => {
    makeSpikeRegion();
    expect(findCaptionRegion()?.getAttribute('aria-label')).toBe('Captions');
  });

  it('اولویت Captions بر برچسب فارسی وقتی هر دو وجود دارند', () => {
    document.body.innerHTML =
      '<div role="region" aria-label="زیرنویس‌ها" id="fa"></div><div role="region" aria-label="Captions" id="en"></div>';
    expect(findCaptionRegion()?.id).toBe('en');
  });

  it('لایه ۱ (کلاس‌ها): گوینده و متن', () => {
    const r = makeSpikeRegion(true);
    expect(parseCaptionRegion(r).map((b) => [b.speaker, b.text])).toEqual(expected);
  });

  it('لایه ۲ (بدون کلاس، فقط ساختار): همان خروجی', () => {
    const r = makeSpikeRegion(false);
    expect(parseCaptionRegion(r).map((b) => [b.speaker, b.text])).toEqual(expected);
  });

  it('دکمه Jump to bottom و آیکون آن وارد متن نمی‌شوند', () => {
    const r = makeSpikeRegion();
    expect(parseCaptionRegion(r).some((b) => /arrow|Jump/.test(b.text + b.speaker))).toBe(false);
  });

  it('رشد متن در ساختار واقعی بدون تکرار', () => {
    let t = 0;
    const tr = new SegmentTracker(() => t);
    const r = makeSpikeRegion();
    tr.update(parseCaptionRegion(r));
    const textEl = spikeBlocks()[1].querySelector('.ygicle')!;
    t += 300; textEl.textContent = 'ممنون، گزارش Q3 آماده است و فردا ارسال میشه';
    const ch = tr.update(parseCaptionRegion(r));
    expect(ch).toHaveLength(1);
    expect(ch[0].text).toBe('ممنون، گزارش Q3 آماده است و فردا ارسال میشه');
  });
});
