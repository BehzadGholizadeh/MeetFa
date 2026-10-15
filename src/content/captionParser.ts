import { CLASS_HINTS } from './selectors';

/**
 * تبدیل ناحیه زیرنویس به بلوک‌های {el, speaker, text}.
 * ساختار تأییدشده در spike:
 *   بلوک ─┬─ عنصر حاوی img (آواتار) + span نام گوینده
 *         └─ عنصر جداگانه متن گفتار
 * لایه ۱: کلاس‌های مشاهده‌شده (سریع)  |  لایه ۲: ساختاری (بدون کلاس)  |  لایه ۳: فرزندان مستقیم
 */
export interface RawBlock {
  el: Element;
  speaker: string;
  text: string;
}

const SKIP = 'button, [role="button"], [aria-hidden="true"], style, script';
const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

function textLeaves(el: Element, exclude?: Element): string[] {
  const out: string[] = [];
  const walk = (node: Element) => {
    if (node.matches(SKIP) || node === exclude) return;
    const own = Array.from(node.childNodes)
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent ?? '')
      .join('')
      .trim();
    if (own) out.push(own);
    Array.from(node.children).forEach(walk);
  };
  walk(el);
  return out;
}

/** از img بالا می‌رویم تا اولین عنصری که متن (نام گوینده) دارد */
function nameContainer(block: Element): Element | null {
  const img = block.querySelector('img');
  let cur: Element | null = img?.parentElement ?? null;
  while (cur && cur !== block) {
    if (textLeaves(cur).length > 0) return cur;
    cur = cur.parentElement;
  }
  return null;
}

function parseBlock(el: Element): RawBlock {
  const nameEl = nameContainer(el);
  const speaker = nameEl ? clean(textLeaves(nameEl).join(' ')) : '';
  const hinted = el.getElementsByClassName(CLASS_HINTS.text)[0];
  const text = hinted ? clean(hinted.textContent ?? '') : clean(textLeaves(el, nameEl ?? undefined).join(' '));
  return { el, speaker: speaker || 'نامشخص', text };
}

/** لایه ۲: کوچک‌ترین عنصری که هم img دارد و هم متنی بیرون از ظرف نام */
function structuralBlocks(region: Element): Element[] {
  const blocks: Element[] = [];
  for (const img of Array.from(region.querySelectorAll('img'))) {
    let cur: Element | null = img.parentElement;
    while (cur && cur !== region) {
      const nameEl = nameContainer(cur);
      if (nameEl && nameEl !== cur && textLeaves(cur, nameEl).length > 0) break;
      cur = cur.parentElement;
    }
    if (cur && cur !== region && !blocks.includes(cur)) blocks.push(cur);
  }
  return blocks;
}

export function parseCaptionRegion(region: Element): RawBlock[] {
  let blockEls = Array.from(region.getElementsByClassName(CLASS_HINTS.block));
  if (blockEls.length === 0) blockEls = structuralBlocks(region);
  if (blockEls.length > 0) return blockEls.map(parseBlock).filter((b) => b.text.length > 0);

  // لایه ۳: بدون آواتار — هر فرزند مستقیم دارای متن یک بلوک
  return Array.from(region.children)
    .map((el) => {
      const leaves = textLeaves(el);
      const speaker = leaves.length >= 2 ? leaves[0] : 'نامشخص';
      return { el, speaker, text: clean((leaves.length >= 2 ? leaves.slice(1) : leaves).join(' ')) };
    })
    .filter((b) => b.text.length > 0);
}

/** آیا ناحیه متنی دارد؟ (برای تشخیص «متن هست ولی parse نشد») */
export function regionHasText(region: Element): boolean {
  return textLeaves(region).join('').trim().length > 0;
}
