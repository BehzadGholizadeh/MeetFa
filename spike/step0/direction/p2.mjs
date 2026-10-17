// MeetFa base-direction policy P2 (owner decision, conditional on real tests). SPIKE ONLY — not product code.
// 1. At least one Persian/Arabic/Hebrew LETTER  -> 'rtl'
// 2. else at least one Latin/Greek/Cyrillic LETTER -> 'ltr'
// 3. else (no such letters)                        -> 'rtl' (document default)
// "Letter" = General_Category L*; script = Unicode Script property of the JS engine (Node/Chrome ICU).
// Digits, punctuation, emoji, marks, ZWNJ, tatweel (Script=Common) are not letters.
// Letters of other scripts (Syriac, Thaana, CJK, Devanagari, ...) are NOT covered by the rule and are ignored.
export const RTL_LETTER = /[\p{L}&&[\p{Script=Arabic}\p{Script=Hebrew}]]/v;
export const LTR_LETTER = /[\p{L}&&[\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}]]/v;
export function baseDirection(text) {
  if (RTL_LETTER.test(text)) return 'rtl';
  if (LTR_LETTER.test(text)) return 'ltr';
  return 'rtl';
}
