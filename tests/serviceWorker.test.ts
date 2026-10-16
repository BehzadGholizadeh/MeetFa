import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installChromeMock } from './chromeMock';
import { LIVE_PERSIST_MS } from '../src/shared/constants';
import type { Segment } from '../src/shared/types';

/**
 * همگام‌سازی قطعی: به‌جای sleep ثابت، تا خالی شدن صف سریال SW صبر می‌کنیم (sw.whenIdle).
 * تایمر ذخیره متن زنده با fake timers پیش برده می‌شود؛ fake-indexeddb از setImmediate
 * استفاده می‌کند که fake نمی‌شود.
 */
const seg = (id: string, text: string, final: boolean, t = Date.now()): Segment =>
  ({ id, speaker: 'گوینده ۱', text, startedAt: t, updatedAt: t, final });

let mock: ReturnType<typeof installChromeMock>;
let repo: typeof import('../src/storage/repositories');
let sw: typeof import('../src/background/serviceWorker');

/**
 * بارگذاری تازه SW.
 *  keepData=false: IndexedDB و storage.session تازه (تست مستقل)
 *  keepData=true : شبیه‌سازی kill/restart — داده حفظ، listenerهای SW قبلی حذف
 */
async function bootSW(keepData = false, opts?: Parameters<typeof installChromeMock>[0]) {
  vi.resetModules();
  if (keepData) {
    mock.resetListeners();
  } else {
    (globalThis as any).indexedDB = new (await import('fake-indexeddb')).IDBFactory();
    mock = installChromeMock(opts);
  }
  repo = await import('../src/storage/repositories');
  sw = await import('../src/background/serviceWorker');
  await sw.whenIdle(); // بازیابی هنگام boot
}

const sessions = () => repo.listSessions();

beforeEach(async () => {
  await bootSW();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('Service Worker — چرخه جلسه', () => {
  it('شروع → متن نهایی → خروج: یک جلسه ended با متن ذخیره‌شده', async () => {
    mock.fromTab(1, { type: 'MEETING_STARTED', meetCode: 'abc-defg-hij' });
    mock.fromTab(1, { type: 'SEGMENT_UPSERT', segment: seg('s1', 'سلام', true) });
    mock.fromTab(1, { type: 'MEETING_ENDED' });
    await sw.whenIdle();
    const [s] = await sessions();
    expect(s).toMatchObject({ status: 'ended', segmentCount: 1 });
    expect((await repo.getSegments(s.id)).map((x) => x.text)).toEqual(['سلام']);
  });

  it('ترتیب پیام‌ها: upsert بلافاصله بعد از START به همان جلسه می‌رسد', async () => {
    mock.fromTab(1, { type: 'MEETING_STARTED', meetCode: 'abc-defg-hij' });
    mock.fromTab(1, { type: 'SEGMENT_UPSERT', segment: seg('s1', 'اول', true) });
    await sw.whenIdle();
    const [s] = await sessions();
    expect(s.segmentCount).toBe(1);
  });

  it('متن زنده دقیقاً بعد از LIVE_PERSIST_MS ذخیره می‌شود (نه زودتر)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    mock.fromTab(1, { type: 'MEETING_STARTED', meetCode: 'abc-defg-hij' });
    mock.fromTab(1, { type: 'SEGMENT_UPSERT', segment: seg('s1', 'در حال گفتن', false) });
    await sw.whenIdle();
    const [s] = await sessions();
    expect(await repo.getSegments(s.id)).toHaveLength(0);

    vi.advanceTimersByTime(LIVE_PERSIST_MS - 1);
    await sw.whenIdle();
    expect(await repo.getSegments(s.id)).toHaveLength(0);

    vi.advanceTimersByTime(1);
    await sw.whenIdle();
    expect((await repo.getSegments(s.id))[0]).toMatchObject({ text: 'در حال گفتن', final: false });
  });

  it('رویداد دیررس: نسخه غیرنهایی، segment نهایی را بازنویسی نمی‌کند', async () => {
    mock.fromTab(1, { type: 'MEETING_STARTED', meetCode: 'abc-defg-hij' });
    mock.fromTab(1, { type: 'SEGMENT_UPSERT', segment: seg('s1', 'متن نهایی کامل', true) });
    await sw.whenIdle();
    const [s] = await sessions();
    await repo.upsertSegments(s.id, [seg('s1', 'متن نها', false)]);
    expect((await repo.getSegments(s.id))[0]).toMatchObject({ text: 'متن نهایی کامل', final: true });
    expect((await repo.getSession(s.id))?.segmentCount).toBe(1);
  });
});

describe('Service Worker — بازیابی', () => {
  it('بستن تب (pagehide → MEETING_ENDED unload، سپس onRemoved) ⇒ interrupted', async () => {
    mock.fromTab(1, { type: 'MEETING_STARTED', meetCode: 'abc-defg-hij' });
    mock.fromTab(1, { type: 'SEGMENT_UPSERT', segment: seg('s1', 'قبل از بستن', true) });
    mock.fromTab(1, { type: 'MEETING_ENDED', reason: 'unload' });
    mock.closeTab(1);
    await sw.whenIdle();
    const [s] = await sessions();
    expect(s.status).toBe('interrupted');
    expect(s.segmentCount).toBe(1);
  });

  it('Reload و شروع دوباره همان جلسه ⇒ جلسه تکراری ساخته نمی‌شود', async () => {
    mock.fromTab(1, { type: 'MEETING_STARTED', meetCode: 'abc-defg-hij' });
    mock.fromTab(1, { type: 'SEGMENT_UPSERT', segment: seg('s1', 'قبل', true) });
    mock.fromTab(1, { type: 'MEETING_ENDED', reason: 'unload' });
    mock.reloadTab(1);
    mock.fromTab(1, { type: 'MEETING_STARTED', meetCode: 'abc-defg-hij' });
    mock.fromTab(1, { type: 'SEGMENT_UPSERT', segment: seg('s2', 'بعد', true) });
    await sw.whenIdle();
    const list = await sessions();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ status: 'active', segmentCount: 2 });
  });

  it('کد جلسه متفاوت در همان تب ⇒ جلسه جدید', async () => {
    mock.fromTab(1, { type: 'MEETING_STARTED', meetCode: 'aaa-aaaa-aaa' });
    mock.reloadTab(1);
    mock.fromTab(1, { type: 'MEETING_STARTED', meetCode: 'bbb-bbbb-bbb' });
    await sw.whenIdle();
    // هر دو جلسه ممکن است در یک میلی‌ثانیه ساخته شوند ⇒ ترتیب لیست در تساوی startedAt تعریف‌نشده است؛
    // موضوع این تست وضعیت هر جلسه است، نه ترتیب لیست
    const list = await sessions();
    expect(list).toHaveLength(2);
    const byCode = Object.fromEntries(list.map((s) => [s.meetCode, s.status]));
    expect(byCode).toEqual({ 'bbb-bbbb-bbb': 'active', 'aaa-aaaa-aaa': 'interrupted' });
  });

  it('راه‌اندازی مجدد SW با تب زنده ⇒ جلسه active می‌ماند', async () => {
    mock.fromTab(1, { type: 'MEETING_STARTED', meetCode: 'abc-defg-hij' });
    await sw.whenIdle();
    await bootSW(true); // storage.session حفظ شده (SW kill، نه مرورگر)
    expect(mock.listenerCount()).toBe(1); // فقط SW جدید
    expect((await sessions())[0].status).toBe('active');
  });

  it('بستن مرورگر/کرش (storage.session پاک) ⇒ interrupted با endedAt = آخرین متن', async () => {
    mock.fromTab(1, { type: 'MEETING_STARTED', meetCode: 'abc-defg-hij' });
    const last = Date.now() + 60_000; // آخرین تغییر متن، بعد از شروع جلسه
    mock.fromTab(1, { type: 'SEGMENT_UPSERT', segment: seg('s1', 'آخرین', true, last) });
    await sw.whenIdle();
    for (const k of Object.keys(mock.session)) delete mock.session[k];
    await bootSW(true);
    const [s] = await sessions();
    expect(s).toMatchObject({ status: 'interrupted', endedAt: last });
  });

  it('حذف جلسه active در لایه داده رد می‌شود؛ upsert به جلسه حذف‌شده segment یتیم نمی‌سازد', async () => {
    mock.fromTab(1, { type: 'MEETING_STARTED', meetCode: 'abc-defg-hij' });
    await sw.whenIdle();
    const [s] = await sessions();
    expect(await repo.deleteSession(s.id)).toBe(false);
    expect(await repo.getSession(s.id)).toBeDefined();

    await repo.endSession(s.id, 'ended');
    expect(await repo.deleteSession(s.id)).toBe(true);
    await repo.upsertSegments(s.id, [seg('late', 'دیررس', true)]);
    expect(await repo.getSegments(s.id)).toHaveLength(0);
  });
});

describe('رگرسیون: همگام‌سازی تست مستقل از سرعت اجرا', () => {
  it('با storage کند (۱۵۰ms هر خواندن)، whenIdle تا پایان واقعی پردازش صبر می‌کند', async () => {
    await bootSW(false, { storageDelayMs: 150 });
    mock.fromTab(1, { type: 'MEETING_STARTED', meetCode: 'abc-defg-hij' });
    mock.fromTab(1, { type: 'SEGMENT_UPSERT', segment: seg('s1', 'سلام', true) });
    mock.fromTab(1, { type: 'MEETING_ENDED' });

    // همان sleep ثابت ۶۰ms نسخه قبلی: صف هنوز در حال پردازش است ⇒ روش قبلی شکننده بود
    await new Promise((r) => setTimeout(r, 60));
    expect((await sessions()).find((s) => s.status === 'ended')).toBeUndefined();

    await sw.whenIdle();
    const [s] = await sessions();
    expect(s).toMatchObject({ status: 'ended', segmentCount: 1 });
  });

  it('whenIdle کارهایی را که حین انتظار به صف اضافه می‌شوند هم پوشش می‌دهد', async () => {
    mock.fromTab(1, { type: 'MEETING_STARTED', meetCode: 'abc-defg-hij' });
    const idle = sw.whenIdle();
    mock.fromTab(1, { type: 'SEGMENT_UPSERT', segment: seg('s1', 'دیرتر اضافه شد', true) });
    await idle;
    expect((await sessions())[0].segmentCount).toBe(1);
  });

  it('دو جلسه با startedAt یکسان (یک میلی‌ثانیه): هر دو با وضعیت درست ثبت می‌شوند', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000);
    try {
      mock.fromTab(1, { type: 'MEETING_STARTED', meetCode: 'aaa-aaaa-aaa' });
      mock.reloadTab(1);
      mock.fromTab(1, { type: 'MEETING_STARTED', meetCode: 'bbb-bbbb-bbb' });
      await sw.whenIdle();
      const list = await sessions();
      expect(list.map((s) => s.startedAt)).toEqual([1_800_000_000_000, 1_800_000_000_000]);
      expect(Object.fromEntries(list.map((s) => [s.meetCode, s.status]))).toEqual({
        'bbb-bbbb-bbb': 'active',
        'aaa-aaaa-aaa': 'interrupted',
      });
    } finally {
      now.mockRestore();
    }
  });
});
