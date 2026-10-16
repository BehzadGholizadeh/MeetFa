import type { Segment, Session, StoredSegment } from '../shared/types';
import { getDB } from './db';

const STRICT = { durability: 'strict' } as const;

export function defaultTitle(meetCode: string, at: number): string {
  const d = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' }).format(at);
  return `جلسه ${meetCode} — ${d}`;
}

// ───────────── Sessions ─────────────

export async function createSession(meetCode: string, startedAt = Date.now()): Promise<Session> {
  const s: Session = {
    id: crypto.randomUUID(),
    title: defaultTitle(meetCode, startedAt),
    meetCode,
    startedAt,
    status: 'active',
    segmentCount: 0,
  };
  const db = await getDB();
  await db.put('sessions', s);
  return s;
}

export async function getSession(id: string): Promise<Session | undefined> {
  return (await getDB()).get('sessions', id);
}

/** جدیدترین اول */
export async function listSessions(): Promise<Session[]> {
  const all = await (await getDB()).getAllFromIndex('sessions', 'byStartedAt');
  return all.reverse();
}

/** read-modify-write در یک تراکنش ⇒ تغییر نام از Side Panel با پایان جلسه از SW تداخل ندارد */
async function patchSession(id: string, fn: (s: Session) => void): Promise<Session | undefined> {
  const db = await getDB();
  const tx = db.transaction('sessions', 'readwrite', STRICT);
  const s = await tx.store.get(id);
  if (s) {
    fn(s);
    await tx.store.put(s);
  }
  await tx.done;
  return s;
}

export function renameSession(id: string, title: string): Promise<Session | undefined> {
  const t = title.trim();
  if (!t) return Promise.resolve(undefined);
  return patchSession(id, (s) => void (s.title = t.slice(0, 200)));
}

export function endSession(id: string, status: 'ended' | 'interrupted', endedAt = Date.now()) {
  return patchSession(id, (s) => {
    if (s.status !== 'active') return;
    s.status = status;
    s.endedAt = endedAt;
  });
}

export function reopenSession(id: string) {
  return patchSession(id, (s) => {
    s.status = 'active';
    delete s.endedAt;
  });
}

/**
 * حذف جلسه + همه segmentهایش در یک تراکنش.
 * جلسه active حذف نمی‌شود (خروجی false) — حتی اگر UI قدیمی دکمه را فعال نشان داده باشد
 * (مثلاً جلسه‌ای که بعد از رندر لیست با reload دوباره active شده).
 */
export async function deleteSession(id: string): Promise<boolean> {
  const db = await getDB();
  const tx = db.transaction(['sessions', 'segments'], 'readwrite', STRICT);
  const s = await tx.objectStore('sessions').get(id);
  if (s?.status === 'active') {
    await tx.done;
    return false;
  }
  const segStore = tx.objectStore('segments');
  for (const key of await segStore.index('bySession').getAllKeys(id)) await segStore.delete(key);
  await tx.objectStore('sessions').delete(id);
  await tx.done;
  return true;
}

// ───────────── Segments ─────────────

/**
 * upsert دسته‌ای؛ شمارنده جلسه در همان تراکنش به‌روز می‌شود.
 * - جلسه وجود ندارد (حذف‌شده) ⇒ هیچ چیز نوشته نمی‌شود (جلوگیری از segment یتیم)
 * - نسخه غیرنهایی دیررس، segment نهایی‌شده را بازنویسی نمی‌کند
 */
export async function upsertSegments(sessionId: string, segs: Segment[]): Promise<void> {
  if (segs.length === 0) return;
  const db = await getDB();
  const tx = db.transaction(['segments', 'sessions'], 'readwrite', STRICT);
  const sStore = tx.objectStore('sessions');
  const s = await sStore.get(sessionId);
  if (!s) {
    await tx.done;
    return;
  }
  const segStore = tx.objectStore('segments');
  let added = 0;
  for (const seg of segs) {
    const prev = await segStore.get(seg.id);
    if (!prev) added++;
    else if (prev.final && !seg.final) continue;
    await segStore.put({ ...seg, sessionId } satisfies StoredSegment);
  }
  if (added) await sStore.put({ ...s, segmentCount: s.segmentCount + added });
  await tx.done;
}

/** به ترتیب زمان شروع */
export async function getSegments(sessionId: string): Promise<StoredSegment[]> {
  const list = await (await getDB()).getAllFromIndex('segments', 'bySession', sessionId);
  return list.sort((a, b) => a.startedAt - b.startedAt);
}

// ───────────── Recovery ─────────────

/**
 * جلسه‌های active که به هیچ تب زنده‌ای وصل نیستند ⇒ interrupted
 * (کرش مرورگر، بستن مرورگر، kill شدن ناگهانی). endedAt = آخرین تغییر متن.
 */
export async function recoverOrphans(liveSessionIds: Set<string>): Promise<number> {
  const db = await getDB();
  const active = await db.getAllFromIndex('sessions', 'byStatus', 'active');
  let n = 0;
  for (const s of active) {
    if (liveSessionIds.has(s.id)) continue;
    const segs = await getSegments(s.id);
    const last = segs.reduce((m, x) => Math.max(m, x.updatedAt), s.startedAt);
    await endSession(s.id, 'interrupted', last);
    n++;
  }
  return n;
}
