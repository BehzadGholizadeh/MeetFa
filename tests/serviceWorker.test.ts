import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installChromeMock, settle } from './chromeMock';
import type { Segment } from '../src/shared/types';

const seg = (id: string, text: string, final: boolean, t = Date.now()): Segment =>
  ({ id, speaker: 'گوینده ۱', text, startedAt: t, updatedAt: t, final });

let mock: ReturnType<typeof installChromeMock>;
let repo: typeof import('../src/storage/repositories');

/** هر تست: IndexedDB خالی + بارگذاری تازه SW (مثل بالا آمدن SW) */
async function bootSW(keepData = false) {
  vi.resetModules();
  if (!keepData) {
    (globalThis as any).indexedDB = new (await import('fake-indexeddb')).IDBFactory();
    mock = installChromeMock();
  }
  repo = await import('../src/storage/repositories');
  await import('../src/background/serviceWorker');
  await settle();
}

const sessions = () => repo.listSessions();

beforeEach(async () => {
  await bootSW();
});

describe('Service Worker — چرخه جلسه', () => {
  it('شروع → متن نهایی → خروج: یک جلسه ended با متن ذخیره‌شده', async () => {
    mock.fromTab(1, { type: 'MEETING_STARTED', meetCode: 'abc-defg-hij' });
    mock.fromTab(1, { type: 'SEGMENT_UPSERT', segment: seg('s1', 'سلام', true) });
    mock.fromTab(1, { type: 'MEETING_ENDED' });
    await settle();
    const [s] = await sessions();
    expect(s).toMatchObject({ status: 'ended', segmentCount: 1 });
    expect((await repo.getSegments(s.id)).map((x) => x.text)).toEqual(['سلام']);
  });

  it('ترتیب پیام‌ها: upsert بلافاصله بعد از START به همان جلسه می‌رسد', async () => {
    mock.fromTab(1, { type: 'MEETING_STARTED', meetCode: 'abc-defg-hij' });
    mock.fromTab(1, { type: 'SEGMENT_UPSERT', segment: seg('s1', 'اول', true) });
    await settle();
    const [s] = await sessions();
    expect(s.segmentCount).toBe(1);
  });

  it('متن زنده بعد از LIVE_PERSIST_MS ذخیره می‌شود', async () => {
    mock.fromTab(1, { type: 'MEETING_STARTED', meetCode: 'abc-defg-hij' });
    mock.fromTab(1, { type: 'SEGMENT_UPSERT', segment: seg('s1', 'در حال گفتن', false) });
    await settle();
    const [s] = await sessions();
    expect(await repo.getSegments(s.id)).toHaveLength(0);
    await settle(2200);
    expect((await repo.getSegments(s.id))[0]).toMatchObject({ text: 'در حال گفتن', final: false });
  }, 5000);

  it('رویداد دیررس: نسخه غیرنهایی، segment نهایی را بازنویسی نمی‌کند', async () => {
    mock.fromTab(1, { type: 'MEETING_STARTED', meetCode: 'abc-defg-hij' });
    mock.fromTab(1, { type: 'SEGMENT_UPSERT', segment: seg('s1', 'متن نهایی کامل', true) });
    await settle();
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
    await settle();
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
    await settle();
    const list = await sessions();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ status: 'active', segmentCount: 2 });
  });

  it('کد جلسه متفاوت در همان تب ⇒ جلسه جدید', async () => {
    mock.fromTab(1, { type: 'MEETING_STARTED', meetCode: 'aaa-aaaa-aaa' });
    mock.reloadTab(1);
    mock.fromTab(1, { type: 'MEETING_STARTED', meetCode: 'bbb-bbbb-bbb' });
    await settle();
    expect((await sessions()).map((s) => [s.meetCode, s.status])).toEqual([
      ['bbb-bbbb-bbb', 'active'],
      ['aaa-aaaa-aaa', 'interrupted'],
    ]);
  });

  it('راه‌اندازی مجدد SW با تب زنده ⇒ جلسه active می‌ماند', async () => {
    mock.fromTab(1, { type: 'MEETING_STARTED', meetCode: 'abc-defg-hij' });
    await settle();
    await bootSW(true); // storage.session حفظ شده (SW kill، نه مرورگر)
    expect((await sessions())[0].status).toBe('active');
  });

  it('بستن مرورگر/کرش (storage.session پاک) ⇒ interrupted با endedAt = آخرین متن', async () => {
    mock.fromTab(1, { type: 'MEETING_STARTED', meetCode: 'abc-defg-hij' });
    const last = Date.now() + 60_000; // آخرین تغییر متن، بعد از شروع جلسه
    mock.fromTab(1, { type: 'SEGMENT_UPSERT', segment: seg('s1', 'آخرین', true, last) });
    await settle();
    for (const k of Object.keys(mock.session)) delete mock.session[k];
    await bootSW(true);
    const [s] = await sessions();
    expect(s).toMatchObject({ status: 'interrupted', endedAt: last });
  });

  it('حذف جلسه active در لایه داده رد می‌شود؛ upsert به جلسه حذف‌شده segment یتیم نمی‌سازد', async () => {
    mock.fromTab(1, { type: 'MEETING_STARTED', meetCode: 'abc-defg-hij' });
    await settle();
    const [s] = await sessions();
    expect(await repo.deleteSession(s.id)).toBe(false);
    expect(await repo.getSession(s.id)).toBeDefined();

    await repo.endSession(s.id, 'ended');
    expect(await repo.deleteSession(s.id)).toBe(true);
    await repo.upsertSegments(s.id, [seg('late', 'دیررس', true)]);
    expect(await repo.getSegments(s.id)).toHaveLength(0);
  });
});
