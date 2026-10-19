/** Longest base name kept, in user-perceived characters (grapheme clusters); ".docx" is added after. */
export const MAX_BASENAME = 80;

/** Characters Windows, macOS or Chrome reject in a file name, plus C0/C1 controls. */
const FORBIDDEN = /[<>:"/\\|?*\u0000-\u001F\u007F-\u009F]/g;
/** Bidi controls and BOM: invisible, and can make a name display misleadingly (e.g. "…cod.exe"). ZWNJ is kept: Persian needs it. */
const INVISIBLE = /[؜‎‏‪-‮⁦-⁩﻿]/g;
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])$/i;
/** Spaces, dots and joiners are not allowed (or not useful) at either end of a name. */
const EDGE = /^[\s.‌‍]+|[\s.‌‍]+$/g;

function graphemes(s: string): string[] {
  return [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s)].map((g) => g.segment);
}

function fallbackName(startedAt?: number): string {
  if (typeof startedAt === 'number' && Number.isFinite(startedAt)) {
    const d = new Date(startedAt);
    if (!Number.isNaN(d.getTime())) {
      const p = (n: number) => String(n).padStart(2, '0');
      return `MeetFa-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    }
  }
  return 'MeetFa-transcript';
}

/**
 * A safe .docx file name from the session title.
 * Removes forbidden and invisible characters, collapses white space, trims edges,
 * truncates long titles on a grapheme boundary, and falls back to "MeetFa-YYYY-MM-DD" when nothing is left.
 */
export function docxFileName(title: unknown, startedAt?: number): string {
  let base = typeof title === 'string' ? title.normalize('NFC') : '';
  base = base.replace(INVISIBLE, '').replace(FORBIDDEN, ' ').replace(/\s+/g, ' ').replace(EDGE, '');
  const parts = graphemes(base);
  if (parts.length > MAX_BASENAME) base = parts.slice(0, MAX_BASENAME).join('').replace(EDGE, '');
  if (WINDOWS_RESERVED.test(base.split('.')[0])) base = `_${base}`;
  return `${base || fallbackName(startedAt)}.docx`;
}
