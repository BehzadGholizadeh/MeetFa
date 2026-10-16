import type { ContentMessage } from '../shared/messages';
import { LEAVE_DEBOUNCE_MS, MEET_CODE_RE } from '../shared/constants';
import { findCaptionRegion, isLeaveButtonPresent } from './selectors';
import { CaptionObserver } from './captionObserver';

/** ارسال امن؛ اگر افزونه reload شده باشد، این اسکریپت یتیم است و باید متوقف شود */
let alive = true;
function send(msg: ContentMessage): void {
  if (!alive) return;
  try {
    chrome.runtime.sendMessage(msg).catch(() => {});
  } catch {
    alive = false; // Extension context invalidated
    shutdown();
  }
}

let observer: CaptionObserver | null = null;
let currentCode: string | null = null;
let notInCallSince: number | null = null;

function meetCodeFromUrl(): string | null {
  return MEET_CODE_RE.exec(location.pathname)?.[1] ?? null;
}

/** داخل تماس = URL جلسه + (دکمه خروج یا ناحیه زیرنویس) — لابی پیش از ورود حساب نمی‌شود */
function inCall(): boolean {
  return meetCodeFromUrl() !== null && (isLeaveButtonPresent() || findCaptionRegion() !== null);
}

function enter(code: string): void {
  currentCode = code;
  send({ type: 'MEETING_STARTED', meetCode: code });
  observer = new CaptionObserver({
    onSegments: (segs) => segs.forEach((segment) => send({ type: 'SEGMENT_UPSERT', segment })),
    onStatus: (status, detail) => send({ type: 'STATUS', status, detail }),
  });
  observer.start();
}

function leave(reason: 'left' | 'unload' = 'left'): void {
  observer?.stop();
  observer = null;
  currentCode = null;
  send({ type: 'MEETING_ENDED', reason });
}

function tick(): void {
  const code = meetCodeFromUrl();
  const active = inCall();

  if (active && code) {
    notInCallSince = null;
    if (currentCode !== code) {
      if (currentCode) leave(); // جابه‌جایی مستقیم بین دو جلسه (SPA)
      enter(code);
    }
    return;
  }
  if (currentCode) {
    notInCallSince ??= Date.now();
    if (Date.now() - notInCallSince > LEAVE_DEBOUNCE_MS) {
      notInCallSince = null;
      leave();
    }
  }
}

const loop = window.setInterval(tick, 1000);
function shutdown(): void {
  window.clearInterval(loop);
  observer?.stop();
}
window.addEventListener('pagehide', () => {
  if (currentCode) leave('unload'); // بستن تب / reload ⇒ «قطع‌شده»، نه «پایان‌یافته»
});
tick();
