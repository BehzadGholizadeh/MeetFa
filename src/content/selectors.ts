/**
 * تنها نقطه وابسته به DOM گوگل‌میت.
 * وضعیت (spike زنده، جلسه Persian (Iran)، اکتبر ۲۰۲۶) — جزئیات: docs/dom-spike.md
 *  ✅ تأییدشده: ناحیه = role="region" + aria-label="Captions"
 *  ✅ تأییدشده: بلوک = img + span نام، سپس عنصر جداگانه متن
 *  ⏳ تأییدنشده: برچسب‌های فارسی، دکمه Leave، دکمه CC
 */

/** aria-label ناحیه زیرنویس — به ترتیب اولویت */
export const CAPTION_REGION_LABELS = [
  'Captions', // ✅ تأییدشده (حتی در جلسه فارسی)
  'زیرنویس‌ها', 'زیرنویس ها', 'زیرنویس', // ⏳ فرضی، اولویت پایین
];

/**
 * کلاس‌های مشاهده‌شده در spike. فقط «راهنمای سریع» هستند:
 * مبهم‌سازی‌شده‌اند و با آپدیت Meet عوض می‌شوند؛ parser بدون آن‌ها هم کار می‌کند.
 */
export const CLASS_HINTS = {
  block: 'nMcdL',  // ✅ مشاهده‌شده
  text: 'ygicle',  // ✅ مشاهده‌شده
} as const;

/** ⏳ تأییدنشده */
export const LEAVE_CALL_LABELS = ['Leave call', 'ترک تماس', 'خروج از تماس'];
/** ⏳ تأییدنشده — فقط برای Health Check */
export const CAPTIONS_ON_BUTTON_LABELS = ['Turn off captions', 'خاموش کردن زیرنویس'];

const norm = (s: string) => s.replace(/\u200c/g, ' ').trim().toLowerCase();

/** جست‌وجو به ترتیب اولویت برچسب‌ها (نه ترتیب عناصر در DOM) */
function byAriaLabel(root: ParentNode, sel: string, labels: string[], exact: boolean): Element | null {
  const els = Array.from(root.querySelectorAll(sel)).map((el) => ({ el, label: norm(el.getAttribute('aria-label') ?? '') }));
  for (const wanted of labels.map(norm)) {
    const hit = els.find(({ label }) => (exact ? label === wanted : label.startsWith(wanted)));
    if (hit) return hit.el;
  }
  return null;
}

/** لایه ۱: role=region + aria-label  |  لایه ۲: هر عنصری با همین aria-label */
export function findCaptionRegion(root: ParentNode = document): Element | null {
  return (
    byAriaLabel(root, '[role="region"][aria-label]', CAPTION_REGION_LABELS, true) ??
    byAriaLabel(root, '[aria-label]', CAPTION_REGION_LABELS, true)
  );
}

export function isLeaveButtonPresent(root: ParentNode = document): boolean {
  return byAriaLabel(root, 'button[aria-label]', LEAVE_CALL_LABELS, false) !== null;
}

export function isCaptionsButtonOn(root: ParentNode = document): boolean {
  return byAriaLabel(root, 'button[aria-label]', CAPTIONS_ON_BUTTON_LABELS, false) !== null;
}
