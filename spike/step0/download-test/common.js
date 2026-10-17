import { buildDocx } from './ooxml.js';
import { META, CHECK_TURNS, largeFixture } from './cases.js';

export function log(msg) {
  const li = document.createElement('li');
  li.textContent = `${new Date().toLocaleTimeString()} — ${msg}`;
  document.getElementById('log').prepend(li);
}
/** The download mechanism under test: Blob URL + <a download> click. */
export function blobDownload(bytes, name, mime) {
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.style.display = 'none';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  log(`click() دانلود فراخوانی شد: ${name} (${bytes.length} بایت). در chrome://downloads بررسی کنید.`);
}
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export const files = {
  txt: () => blobDownload(new TextEncoder().encode('\uFEFFMeetFa spike — متن آزمایشی\r\nخط دوم\r\n'), 'MeetFa_spike_test.txt', 'text/plain;charset=utf-8'),
  checks: () => { const r = buildDocx({ meta: META, turns: CHECK_TURNS }, { mode: 'split', paraDir: 'auto' }); blobDownload(r.bytes, 'MeetFa_spike_checks.docx', DOCX); log(`نویسه‌های نامعتبر جایگزین‌شده: ${r.replaced}`); },
  large: () => {
    const t0 = performance.now(); const fx = largeFixture();
    const r = buildDocx({ meta: { ...META, title: 'جلسهٔ آزمایشی بزرگ — 3,000 بخش' }, turns: fx.turns }, { mode: 'split', paraDir: 'auto' });
    const ms = Math.round(performance.now() - t0);
    log(`ساخت فایل بزرگ: ${ms} ms برای ${fx.segments} بخش و ${fx.chars} نویسه (هدف ≤ 5000 ms)`);
    blobDownload(r.bytes, 'MeetFa_spike_large.docx', DOCX);
  },
};
