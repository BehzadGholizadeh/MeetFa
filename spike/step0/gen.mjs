import { mkdirSync, writeFileSync } from 'node:fs';
import { META, CHECK_TURNS, largeFixture } from './cases.mjs';
import { buildDocx } from './ooxml.mjs';
import { buildDocxLib } from './docxlib.mjs';

mkdirSync('out', { recursive: true });
const large = largeFixture();
const results = [];
const time = async (name, fn) => {
  const t0 = performance.now(); const r = await fn(); const ms = performance.now() - t0;
  writeFileSync(`out/${name}.docx`, r.bytes);
  results.push({ file: `${name}.docx`, ms: Math.round(ms), bytes: r.bytes.length, replacedInvalid: r.replaced });
};
await time('hand-checks-A-single-run', () => buildDocx({ meta: META, turns: CHECK_TURNS }, { mode: 'single' }));
await time('hand-checks-B-split-runs', () => buildDocx({ meta: META, turns: CHECK_TURNS }, { mode: 'split' }));
await time('hand-checks-C-split-auto-dir', () => buildDocx({ meta: META, turns: CHECK_TURNS }, { mode: 'split', paraDir: 'auto' }));
await time('hand-large', () => buildDocx({ meta: { ...META, title: 'جلسهٔ آزمایشی بزرگ — 3,000 بخش' }, turns: large.turns }, { mode: 'split' }));
await time('lib-checks', () => buildDocxLib({ meta: META, turns: CHECK_TURNS }));
await time('lib-large', () => buildDocxLib({ meta: { ...META, title: 'جلسهٔ آزمایشی بزرگ — 3,000 بخش' }, turns: large.turns }));
writeFileSync('out/expected.json', JSON.stringify({
  checks: CHECK_TURNS, large: { segments: large.segments, chars: large.chars, turns: large.turns.length, paragraphs: large.turns.map(t => t.paragraphs) },
}, null, 0));
console.table(results);
console.log(`large fixture: ${large.segments} segments, ${large.chars} chars, ${large.turns.length} turns`);
writeFileSync('out/gen-results.json', JSON.stringify(results, null, 2));
