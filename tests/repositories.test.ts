import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { DB_NAME, getDB, resetDBConnection } from '../src/storage/db';
import {
  createSession, deleteSession, endSession, getSegments, getSession, listSessions,
  recoverOrphans, renameSession, reopenSession, upsertSegments,
} from '../src/storage/repositories';
import type { Segment } from '../src/shared/types';

const seg = (id: string, text: string, t: number, final = true): Segment =>
  ({ id, speaker: 'گوینده ۱', text, startedAt: t, updatedAt: t, final });

beforeEach(async () => {
  (await getDB()).close();
  resetDBConnection();
  await new Promise<void>((res) => {
    const r = indexedDB.deleteDatabase(DB_NAME);
    r.onsuccess = r.onerror = r.onblocked = () => res();
  });
});

describe('IndexedDB — جلسات', () => {
  it('ایجاد با عنوان پیش‌فرض فارسی و وضعیت active', async () => {
    const s = await createSession('abc-defg-hij', 1000);
    expect(s.status).toBe('active');
    expect(s.title).toContain('جلسه abc-defg-hij');
    expect((await getSession(s.id))?.segmentCount).toBe(0);
  });

  it('لیست: جدیدترین اول', async () => {
    const a = await createSession('aaa-aaaa-aaa', 1000);
    const b = await createSession('bbb-bbbb-bbb', 2000);
    expect((await listSessions()).map((s) => s.id)).toEqual([b.id, a.id]);
  });

  it('تغییر نام؛ عنوان خالی نادیده گرفته می‌شود', async () => {
    const s = await createSession('abc-defg-hij');
    await renameSession(s.id, '  جلسه هفتگی فروش  ');
    expect((await getSession(s.id))?.title).toBe('جلسه هفتگی فروش');
    await renameSession(s.id, '   ');
    expect((await getSession(s.id))?.title).toBe('جلسه هفتگی فروش');
  });

  it('پایان جلسه فقط از active؛ reopen', async () => {
    const s = await createSession('abc-defg-hij');
    await endSession(s.id, 'ended', 5000);
    await endSession(s.id, 'interrupted', 9000); // اثری ندارد
    expect(await getSession(s.id)).toMatchObject({ status: 'ended', endedAt: 5000 });
    await reopenSession(s.id);
    expect((await getSession(s.id))?.status).toBe('active');
  });
});

describe('IndexedDB — متن‌ها', () => {
  it('upsert: بدون تکرار، شمارنده درست، ترتیب زمانی', async () => {
    const s = await createSession('abc-defg-hij');
    await upsertSegments(s.id, [seg('2', 'دوم', 20), seg('1', 'اول نسخه ۱', 10, false)]);
    await upsertSegments(s.id, [seg('1', 'اول نسخه نهایی', 10)]);
    const list = await getSegments(s.id);
    expect(list.map((x) => x.text)).toEqual(['اول نسخه نهایی', 'دوم']);
    expect((await getSession(s.id))?.segmentCount).toBe(2);
  });

  it('حذف جلسه متن‌هایش را هم حذف می‌کند و به جلسه دیگر دست نمی‌زند', async () => {
    const a = await createSession('aaa-aaaa-aaa');
    const b = await createSession('bbb-bbbb-bbb');
    await upsertSegments(a.id, [seg('a1', 'x', 1)]);
    await upsertSegments(b.id, [seg('b1', 'y', 1)]);
    await deleteSession(a.id);
    expect(await getSession(a.id)).toBeUndefined();
    expect(await getSegments(a.id)).toEqual([]);
    expect((await getSegments(b.id)).map((x) => x.id)).toEqual(['b1']);
  });
});

describe('بازیابی پس از کرش', () => {
  it('جلسه active بدون تب زنده ⇒ interrupted با endedAt = آخرین متن؛ متن‌ها حفظ', async () => {
    const orphan = await createSession('aaa-aaaa-aaa', 1000);
    const live = await createSession('bbb-bbbb-bbb', 1000);
    await upsertSegments(orphan.id, [seg('o1', 'متن ذخیره‌شده قبل از کرش', 1500)]);

    // شبیه‌سازی کرش: اتصال قطع و دوباره باز می‌شود
    (await getDB()).close();
    resetDBConnection();

    expect(await recoverOrphans(new Set([live.id]))).toBe(1);
    expect(await getSession(orphan.id)).toMatchObject({ status: 'interrupted', endedAt: 1500 });
    expect((await getSession(live.id))?.status).toBe('active');
    expect((await getSegments(orphan.id))[0].text).toBe('متن ذخیره‌شده قبل از کرش');
  });
});
