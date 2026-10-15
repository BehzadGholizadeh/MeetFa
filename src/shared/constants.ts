/** کد جلسه Meet مثل abc-defg-hij */
export const MEET_CODE_RE = /^\/([a-z]{3}-[a-z]{4}-[a-z]{3})(?:$|[/?#])/;
/** حداکثر segment نگه‌داشته‌شده در حافظه جلسه (ذخیره دائمی = مرحله ۲) */
export const MAX_SEGMENTS_IN_STATE = 500;
/** بعد از این مدت بدون تغییر، segment نهایی می‌شود */
export const FINALIZE_IDLE_MS = 4000;
/** حداقل فاصله ارسال آپدیت برای یک segment */
export const UPSERT_THROTTLE_MS = 300;
/** اگر زیرنویس روشن است ولی چیزی parse نشد، بعد از این مدت → خطا */
export const HEALTH_TIMEOUT_MS = 10000;
/** debounce خروج از جلسه (جلوگیری از flicker در re-render) */
export const LEAVE_DEBOUNCE_MS = 3000;
/** segmentهای زنده (غیرنهایی) با این فاصله در IndexedDB ذخیره می‌شوند؛ نهایی‌ها فوری */
export const LIVE_PERSIST_MS = 2000;
/** reload / بازگشت به همان جلسه در همان تب تا این مدت ⇒ ادامه همان جلسه ذخیره‌شده */
export const RESUME_WINDOW_MS = 5 * 60 * 1000;
