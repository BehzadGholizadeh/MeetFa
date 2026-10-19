/**
 * MeetFa base-direction policy P2 (docs/spike-docx.md §7.1).
 * 1. At least one Arabic-script or Hebrew LETTER   → 'rtl'
 * 2. else at least one Latin/Greek/Cyrillic LETTER → 'ltr'
 * 3. else (no such letter)                         → 'rtl' (document default)
 * "Letter" = General_Category L. Digits, punctuation, emoji, marks, ZWNJ and tatweel are not letters.
 * Letters of other scripts (Syriac, CJK, Devanagari, …) are ignored, as in the spike.
 */
export type Direction = 'rtl' | 'ltr';

/** Same sets as the spike's `v`-flag regexes, written with a lookahead so they work with the `u` flag (ES2022 target). */
export const RTL_LETTER = /(?=\p{L})[\p{Script=Arabic}\p{Script=Hebrew}]/u;
export const LTR_LETTER = /(?=\p{L})[\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}]/u;

export function baseDirection(text: string): Direction {
  if (RTL_LETTER.test(text)) return 'rtl';
  if (LTR_LETTER.test(text)) return 'ltr';
  return 'rtl';
}

/**
 * Splits text into maximal runs of one direction. Characters that are not letters of a named script
 * stay with the preceding run; leading ones form a run with `dir: null`.
 * Joining the pieces always gives back the input unchanged.
 */
export function splitByDirection(text: string): { text: string; dir: Direction | null }[] {
  const out: { text: string; dir: Direction | null }[] = [];
  let cur = '';
  let dir: Direction | null = null;
  for (const ch of text) {
    const d: Direction | null = RTL_LETTER.test(ch) ? 'rtl' : LTR_LETTER.test(ch) ? 'ltr' : null;
    if (d && d !== dir && cur) {
      out.push({ text: cur, dir });
      cur = '';
    }
    if (d) dir = d;
    cur += ch;
  }
  if (cur) out.push({ text: cur, dir });
  return out;
}
