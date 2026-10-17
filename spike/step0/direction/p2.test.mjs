// node --test direction/p2.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { baseDirection } from './p2.mjs';

const samples = JSON.parse(readFileSync(new URL('./samples.json', import.meta.url)));

for (const s of samples) {
  test(`${s.id} ${s.group}: ${s.want}`, () => assert.equal(baseDirection(s.text), s.want));
}

const edge = [
  ['empty', '', 'rtl'], ['spaces only', '   ', 'rtl'], ['ZWNJ only', '\u200c', 'rtl'],
  ['Arabic-Indic digits', '١٢٣', 'rtl'], ['tatweel only (Common)', 'ــــ', 'rtl'], ['U+FFFD only', '\uFFFD', 'rtl'],
  ['emoji ZWJ sequence', '👩‍💻', 'rtl'], ['punctuation only', '؟!.()', 'rtl'],
  ['Arabic ligature U+FDF2', '\uFDF2', 'rtl'], ['Arabic presentation form U+FEFB', '\uFEFB', 'rtl'],
  ['Persian with harakat', 'مَن', 'rtl'], ['Arabic yeh/kaf', 'علي كتاب', 'rtl'],
  ['Hebrew with niqqud', 'שָׁלוֹם', 'rtl'],
  ['Latin with combining accent', 'e\u0301', 'ltr'], ['fullwidth Latin', 'ＡＢＣ', 'ltr'],
  ['Greek capital omega', 'Ω', 'ltr'], ['Cyrillic', 'Привет', 'ltr'],
  ['Latin then Hebrew', 'abc שלום', 'rtl'], ['Latin in RLI…PDI isolate (isolates not special in P2)', '\u2067abc\u2069', 'ltr'],
  ['Persian inside LRI…PDI', '\u2066سلام\u2069 hello', 'rtl'],
  // Not covered by the owner's rule: other scripts are ignored -> default RTL (open point, see docs)
  ['Syriac only (not covered)', 'ܐܒܓ', 'rtl'], ['Thaana only (not covered)', 'ދިވެހި', 'rtl'],
  ['CJK only (not covered)', '日本語', 'rtl'], ['Devanagari only (not covered)', 'हिन्दी', 'rtl'],
  ['CJK + Latin', '日本語 API', 'ltr'],
];
for (const [name, text, want] of edge) test(`edge: ${name}`, () => assert.equal(baseDirection(text), want));
