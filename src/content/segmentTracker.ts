import type { Segment } from '../shared/types';
import type { RawBlock } from './captionParser';
import { FINALIZE_IDLE_MS } from '../shared/constants';

const ANCHOR_LEN = 16;

/**
 * ادغام متن قبلی و جدید یک بلوک.
 * Meet متن را (۱) رشد می‌دهد، (۲) انتهایش را اصلاح می‌کند، (۳) ابتدایش را حذف می‌کند (scroll).
 */
export function mergeText(prev: string, next: string): string {
  if (!prev) return next;
  if (!next || next === prev) return prev;

  // متن جدید زیرمجموعه متن قبلی است ⇒ چیزی اضافه نشده
  if (prev.includes(next)) return prev;

  // (۱)+(۲): شروع یکسان (دو کلمه اول) و طول قابل‌مقایسه ⇒ نسخه اصلاح‌شده/رشدیافته جایگزین می‌شود
  if (next.startsWith(prev)) return next;
  const pw = prev.split(' ').slice(0, 2);
  const nw = next.split(' ');
  const sameStart = pw.every((w, i) => nw[i] !== undefined && (nw[i] === w || nw[i].startsWith(w)));
  if (sameStart && next.length >= prev.length * 0.6) return next;

  // (۳): ابتدای متن جدید وسط متن قبلی است ⇒ سرِ حذف‌شده را نگه می‌داریم
  const anchor = next.slice(0, Math.min(ANCHOR_LEN, next.length));
  const idx = prev.lastIndexOf(anchor);
  if (anchor.length >= 6 && idx > 0) return prev.slice(0, idx) + next;

  // ناشناخته: محافظه‌کارانه اضافه می‌کنیم (از دست رفتن متن بدتر از تکرار است)
  return `${prev} ${next}`;
}

/**
 * متن جدیدی که بعد از prevRaw در nextRaw آمده (برای ادامه صحبت در بلوکی که قبلاً نهایی شده).
 * '' یعنی محتوای تازه‌ای نیست (همان متن، اصلاح جزئی، یا فقط حذف ابتدا).
 */
export function continuationAfter(prevRaw: string, nextRaw: string): string {
  if (!prevRaw) return nextRaw;
  if (!nextRaw || nextRaw === prevRaw || prevRaw.includes(nextRaw)) return '';
  if (nextRaw.startsWith(prevRaw)) return nextRaw.slice(prevRaw.length).trim();
  // انتهای متن قبلی هنوز دیده می‌شود (ممکن است ابتدایش حذف شده باشد)
  const tail = prevRaw.slice(-Math.min(ANCHOR_LEN, prevRaw.length));
  const idx = nextRaw.lastIndexOf(tail);
  if (tail.length >= 6 && idx >= 0) return nextRaw.slice(idx + tail.length).trim();
  // اصلاح انتهای متن قبلی توسط ASR: از آخرین مرز کلمه در پیشوند مشترک
  let cp = 0;
  while (cp < Math.min(prevRaw.length, nextRaw.length) && prevRaw[cp] === nextRaw[cp]) cp++;
  if (cp >= prevRaw.length * 0.6) {
    const cut = nextRaw.lastIndexOf(' ', cp);
    const rest = nextRaw.slice(cut < 0 ? cp : cut).trim();
    // اگر فقط کلمات آخر اصلاح شده‌اند و چیزی اضافه نشده، تازه حساب نمی‌شود
    return nextRaw.length > prevRaw.length ? rest : '';
  }
  // متن کاملاً متفاوت در همان عنصر ⇒ همه‌اش تازه است
  return nextRaw;
}

interface Tracked {
  seg: Segment;
  /** آخرین متن خام بلوک در DOM */
  raw: string;
  /** متن خام بلوک در لحظه نهایی شدن segment قبلی همین بلوک (برای جدا کردن ادامه) */
  base: string | null;
}

let counter = 0;
const newId = () => `${Date.now().toString(36)}-${(counter++).toString(36)}`;

/** نگه‌داری segmentها بر اساس هویت عنصر DOM (Meet عنصر بلوک را حین رشد حفظ می‌کند) */
export class SegmentTracker {
  private byEl = new Map<Element, Tracked>();

  constructor(private now: () => number = Date.now) {}

  /** ورودی: اسکن فعلی. خروجی: segmentهایی که تغییر کرده‌اند (شامل نهایی‌شده‌ها) */
  update(blocks: RawBlock[]): Segment[] {
    const t = this.now();
    const changed: Segment[] = [];
    const seen = new Set<Element>();

    blocks.forEach((b, i) => {
      seen.add(b.el);
      const existing = this.byEl.get(b.el);
      if (!existing) {
        const seg: Segment = { id: newId(), speaker: b.speaker, text: b.text, startedAt: t, updatedAt: t, final: false };
        this.byEl.set(b.el, { seg, raw: b.text, base: null });
        changed.push({ ...seg });
      } else if (existing.seg.final) {
        // Meet همان عنصر بلوک را برای ادامه صحبت همان گوینده نگه می‌دارد.
        // segment نهایی تغییر نمی‌کند؛ ادامه به یک segment تازه می‌رود.
        const cont = continuationAfter(existing.raw, b.text);
        if (cont) {
          const seg: Segment = { id: newId(), speaker: b.speaker, text: cont, startedAt: t, updatedAt: t, final: false };
          this.byEl.set(b.el, { seg, raw: b.text, base: existing.raw });
          changed.push({ ...seg });
        } else {
          existing.raw = b.text;
        }
      } else {
        const visible = existing.base !== null ? continuationAfter(existing.base, b.text) || existing.seg.text : b.text;
        const merged = mergeText(existing.seg.text, visible);
        existing.raw = b.text;
        if (merged !== existing.seg.text || b.speaker !== existing.seg.speaker) {
          existing.seg.text = merged;
          existing.seg.speaker = b.speaker;
          existing.seg.updatedAt = t;
          changed.push({ ...existing.seg });
        }
      }
      // بلوکی که بلوک جدیدتری بعدش آمده و مدتی تغییر نکرده ⇒ نهایی
      const tr = this.byEl.get(b.el)!;
      if (!tr.seg.final && i < blocks.length - 1 && t - tr.seg.updatedAt > 1500) {
        tr.seg.final = true;
        changed.push({ ...tr.seg });
      }
    });

    // عناصر حذف‌شده از DOM ⇒ نهایی و رها
    for (const [el, tr] of this.byEl) {
      if (seen.has(el)) continue;
      if (!tr.seg.final) {
        tr.seg.final = true;
        changed.push({ ...tr.seg });
      }
      this.byEl.delete(el);
    }
    return this.dedupe(changed);
  }

  /** نهایی‌سازی بر اساس سکوت (بدون mutation) */
  tick(): Segment[] {
    const t = this.now();
    const out: Segment[] = [];
    for (const tr of this.byEl.values()) {
      if (!tr.seg.final && t - tr.seg.updatedAt >= FINALIZE_IDLE_MS) {
        tr.seg.final = true;
        out.push({ ...tr.seg });
      }
    }
    return out;
  }

  /** پایان جلسه: همه نهایی */
  flushAll(): Segment[] {
    const out: Segment[] = [];
    for (const tr of this.byEl.values()) {
      if (!tr.seg.final) {
        tr.seg.final = true;
        out.push({ ...tr.seg });
      }
    }
    this.byEl.clear();
    return out;
  }

  private dedupe(list: Segment[]): Segment[] {
    const m = new Map<string, Segment>();
    list.forEach((s) => m.set(s.id, s));
    return [...m.values()];
  }
}
