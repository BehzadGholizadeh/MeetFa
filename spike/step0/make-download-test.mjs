// Copies the generator + pinned fflate browser build into the standalone test extension.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
mkdirSync('download-test/vendor', { recursive: true });
writeFileSync('download-test/vendor/fflate.js', readFileSync('node_modules/fflate/esm/browser.js'));
writeFileSync('download-test/ooxml.js', readFileSync('ooxml.mjs', 'utf8').replace("from 'fflate'", "from './vendor/fflate.js'"));
writeFileSync('download-test/cases.js', readFileSync('cases.mjs', 'utf8'));
console.log('download-test ready');
