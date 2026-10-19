import type { Segment } from '../shared/types';
import type { TranscriptTurn } from '../transcript/types';

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

/** Marker for a turn that contains a non-final segment (Stage 3 spec). Shown beside the time, never inside the text. */
export const PARTIAL_MARKER = ' (ناتمام)';

/**
 * One speaker turn from buildTranscript (Stage 3, Step 2).
 * Paragraph text is set with textContent exactly as returned by the presentation layer:
 * no trimming, normalising or de-duplication. White space is kept visible by CSS (pre-wrap).
 */
export function turnView(turn: TranscriptTurn): HTMLElement {
  const el = document.createElement('article');
  el.className = 'turn';
  el.classList.toggle('partial', turn.partial);

  const head = document.createElement('div');
  head.className = 'turn-head';
  const speaker = document.createElement('span');
  speaker.className = 'turn-speaker';
  speaker.dir = 'auto';
  speaker.textContent = turn.speaker;
  const time = document.createElement('time');
  time.dateTime = new Date(turn.startedAt).toISOString();
  time.textContent = timeFmt.format(turn.startedAt);
  time.title = 'زمان نمایش زیرنویس';
  head.append(speaker, time);
  if (turn.partial) {
    const mark = document.createElement('span');
    mark.className = 'turn-partial';
    mark.textContent = PARTIAL_MARKER;
    head.append(mark);
  }
  el.append(head);

  for (const para of turn.paragraphs) {
    const p = document.createElement('p');
    p.className = 'turn-text';
    p.dir = 'auto';
    p.textContent = para.text;
    el.append(p);
  }
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
