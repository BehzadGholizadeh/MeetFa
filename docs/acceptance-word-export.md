# Acceptance test — Word export (Stage 3)

| Item | Value |
| --- | --- |
| Feature | «دریافت فایل Word» in the saved-session detail view |
| Branch / PR | `feature/stage3-word-export`, PR #2 into `main` |
| Code under test | `33081a8` (export code unchanged since `bda38b4` except the `replaced` counter, which does not change file content) |
| Last updated | 19 Oct 2026 |

**Legend:** ✅ verified automatically by Claude · 👤 reported by the owner · ☐ manual check still open · — not applicable. A manual item is never marked ✅.

## 1. Automated checks (run by Claude on the development PC, HEAD `33081a8`)

Environment: Windows 11 Enterprise 10.0.22621, Node v24.18.0, npm 11.16.0, `fflate@0.8.3`.

| Check | Result |
| --- | --- |
| `npm test` (Vitest 2.1.8) | ✅ 145 / 145 passed, 9 files |
| `npm run build` (`tsc --noEmit && vite build`) | ✅ OK |
| Package structure: PK signature, 7 OOXML parts, content types and relationships | ✅ `tests/docxExport.test.ts` |
| Every XML part well-formed | ✅ tests, and Python `xml.dom.minidom` on the samples below |
| ZIP integrity of the samples | ✅ Python `zipfile.testzip()`: no CRC errors |
| Text written unchanged, in chronological order, also with shuffled storage order | ✅ tests |
| Paragraph direction (P2) and script runs in the XML | ✅ tests (checks the XML, not how Word draws it) |
| Speaker on its own paragraph, bold runs, text runs not bold | ✅ tests (XML only) |
| File name from the title; invalid characters, reserved names, long and empty titles | ✅ tests |
| Empty session, incomplete data, read, build and download errors in the panel | ✅ tests (jsdom; not real Chrome) |
| 3,000-segment session builds | ✅ tests; 89 ms for the long sample in Node |

## 2. Owner's manual checks (real Chrome and Word)

**Run by the project owner, by hand. Claude did not run any of these.** Word on the development PC is not available through COM automation.

### A1. Download and open — 👤 PASS (owner report, 19 Oct 2026)

The owner reported that a saved session was opened, «دریافت فایل Word» was clicked, the `.docx` downloaded, and it opened correctly in Word. The report did not say which commit or which Chrome and Word versions were used.

### A2. Detailed checks — ☐ open

Use a file downloaded from the extension built from `33081a8`, and the samples in section 3. Record pass or fail for each item.

| # | Manual check | How to check | Result |
| --- | --- | --- | --- |
| M1 | Opens **without a repair prompt** | Open in Word. No "Word found unreadable content" message | ☐ |
| M2 | Persian text displays correctly and is **right-aligned** | Header lines and Persian paragraphs start at the right margin; "." and "؟" at the left end; ZWNJ (می‌شود) joins correctly; no boxes (Tahoma) | ☐ |
| M3 | **Mixed Persian/English** lines are readable | "API در این سرویس…": "API" rightmost; "این نسخه OpenAI v2.4.0 است.": version intact; "(report.pdf)" brackets correct; "۱۴۰۵ / 2026" in order; the English-only line is left-aligned with "." at the right. Expected under P2: "Please send the file to مریم by Friday." is right-aligned and its clauses may appear reordered | ☐ |
| M4 | **Speaker name** shown as stored and **bold**, separate from the text | One bold speaker line per turn, then the time in grey; "(ناتمام)" in red only on the last turn of the short sample | ☐ |
| M5 | **File name and content** are correct | Name equals the session title without `/ : ? * " < > \|`; title, start and end time, meet code and all spoken text present in order; compare with the panel's «مشاهده متن» view | ☐ |
| M6 | **Long session** (if possible) | Open the long sample: 3,000 segments, 765 turns, 1,666 paragraphs. Opens in ≤ 10 s, scrolls smoothly, no repair prompt. For a real long session, note the `[MeetFa] perf docx` line from the panel console | ☐ |
| M7 | Version details | Chrome (`chrome://version`), Word (File → Account → About Word), Windows build | ☐ |

## 3. Sample files for the owner to review (not yet approved)

These are **not approved samples**. They exist so the owner can run M1–M6, and they are **not committed**: they sit in the untracked folder `acceptance-samples/`.

| File | Bytes | SHA-256 | Content |
| --- | --- | --- | --- |
| `acceptance-samples/نمونهٔ پذیرش Q3 بودجه.docx` | 3,413 | `71b22ad9bc42b22320ae43ec7e30fbaff34fefce7ac9ae15c54f423c8dab16de` | 8 segments, 5 turns, 3 speakers; Persian, English, mixed, partial turn, special characters |
| `acceptance-samples/نمونهٔ پذیرش - جلسهٔ طولانی.docx` | 123,878 | `77c58e6e1c71b367602c9f23eb01e5f0aedf15e47574cfa2086fa2fbdd483540` | `largeFixture()`: 3,000 segments, 765 turns, ~3 hours |

**How they were made:** from HEAD `33081a8`, with `acceptance-samples/make-samples.ts`, run through `npx vite-node -c acceptance-samples/empty.config.mjs acceptance-samples/make-samples.ts <outDir>` (the empty config bypasses the crxjs plugin). The script calls the same functions as the button: `buildTranscript` → `buildTranscriptDocx` → `docxFileName`. Only the storage read and the browser download are skipped. All content is synthetic (`tests/transcriptFixture.ts`). The SHA-256 differs between runs because `core.xml` stores the creation time.

## 4. Not covered

- Google Docs and LibreOffice on Windows (spike checklist §4 D and E).
- If Chrome blocks or cancels a download after the click, the panel is not told; it shows "download started".
- Speaker names are exported as stored; showing real names is a later step.
