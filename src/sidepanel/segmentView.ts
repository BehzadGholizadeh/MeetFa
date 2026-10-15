import type { Segment } from '../shared/types';

export const timeFmt = new Intl.DateTimeFormat('fa-IR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
export const dateFmt = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' });
export const numFmt = new Intl.NumberFormat('fa-IR');

/** ساخت یا به‌روزرسانی عنصر یک segment (همیشه با textContent ⇒ بدون XSS) */
export function segmentView(s: Segment, existing?: HTMLElement): HTMLElement {
  const el = existing ?? document.createElement('article');
  if (!existing) {
    el.className = 'seg';
    el.innerHTML =
      '<div class="seg-head"><span class="seg-speaker"></span><time></time></div><p class="seg-text" dir="auto"></p>';
  }
  el.classList.toggle('live', !s.final);
  el.querySelector('.seg-speaker')!.textContent = s.speaker;
  const t = el.querySelector('time')!;
  t.dateTime = new Date(s.startedAt).toISOString();
  t.textContent = timeFmt.format(s.startedAt);
  el.querySelector('.seg-text')!.textContent = s.text;
  return el;
}

export function durationText(ms: number): string {
  const min = Math.max(0, Math.round(ms / 60000));
  if (min < 1) return 'کمتر از یک دقیقه';
  if (min < 60) return `${numFmt.format(min)} دقیقه`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${numFmt.format(h)} ساعت و ${numFmt.format(m)} دقیقه` : `${numFmt.format(h)} ساعت`;
}
