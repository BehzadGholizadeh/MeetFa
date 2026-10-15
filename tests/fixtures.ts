/** DOM فرضی زیرنویس Meet (ساختار، نه کلاس) — بعد از spike زنده با نمونه واقعی جایگزین شود */
export function makeRegion(label = 'Captions'): HTMLElement {
  document.body.innerHTML = `<div role="region" aria-label="${label}"><div class="list"></div><button aria-label="Jump to bottom">↓</button></div>`;
  return document.querySelector('[role="region"]') as HTMLElement;
}

export function addBlock(region: HTMLElement, speaker: string, text: string): HTMLElement {
  const block = document.createElement('div');
  block.innerHTML = `<div><img src="" alt=""><span>${speaker}</span></div><div><span class="t">${text}</span></div>`;
  region.querySelector('.list')!.appendChild(block);
  return block;
}

export function setText(block: HTMLElement, text: string): void {
  block.querySelector('.t')!.textContent = text;
}

/**
 * بازسازی ماسک‌شده ساختار تأییدشده در spike زنده (جلسه Persian (Iran)).
 * ⚠️ از روی خلاصه یافته‌های مدیر پروژه ساخته شده، نه کپی کلمه‌به‌کلمه HTML خام
 *    (JSON خام spike به Developer نرسیده). کلاس‌های دیگر Meet عمداً حذف شده‌اند.
 */
export function makeSpikeRegion(withClasses = true): HTMLElement {
  document.body.innerHTML = `
<div role="region" aria-label="Captions" tabindex="0">
  <div>
    <div class="nMcdL">
      <div><img src="data:," alt=""><span>گوینده ۱</span></div>
      <div class="ygicle">سلام به همه، جلسه رو شروع می‌کنیم</div>
    </div>
    <div class="nMcdL">
      <div><img src="data:," alt=""><span>گوینده ۲</span></div>
      <div class="ygicle">ممنون، گزارش Q3 آماده است</div>
    </div>
  </div>
  <button aria-label="Jump to bottom"><i aria-hidden="true">arrow_downward</i></button>
</div>`;
  if (!withClasses) document.querySelectorAll('[class]').forEach((e) => e.removeAttribute('class'));
  return document.querySelector('[role="region"]') as HTMLElement;
}

export function spikeBlocks(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[role="region"] > div > div'));
}
