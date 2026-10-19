# Acceptance test — Word export (Stage 3)

| Item | Value |
| --- | --- |
| Feature | «دریافت فایل Word» in the saved-session detail view |
| Branch / PR | `feature/stage3-word-export`, PR #2 into `main` |
| Build tested | commit `bda38b4` (the commit before this record) |
| Recorded | 19 Oct 2026 |

## A1. Owner's manual check in real Chrome and Word — PASS (owner report)

**Run by:** the project owner, by hand. **Not run by Claude.** Claude could not run Chrome or Word for this check; Word on the development PC is not available through COM automation.

**Reported result:** a saved session was opened, «دریافت فایل Word» was clicked, the `.docx` file downloaded, and it opened correctly in Word.

**Not stated in the report (left blank on purpose):**

| Detail | Value |
| --- | --- |
| Chrome version (`chrome://version`) | — |
| Word version (File → Account → About Word) | — |
| Windows build | — |
| Repair prompt on open | — |
| Persian paragraphs right-aligned, English-only paragraphs left-aligned | — |
| Mixed Persian/English lines read correctly | — |
| Speaker lines bold and separate from the text | — |
| File name as expected for the session title | — |
| Session length (segments) and build time from the panel log (`[MeetFa] perf docx`) | — |

Fill these in if they are checked later. Until then, the only fact on record is "downloaded and opened correctly".

## Automated checks (run by Claude on the development PC)

| Check | Result |
| --- | --- |
| `npm test` | 145 / 145 passed (9 files) |
| `npm run build` (`tsc --noEmit && vite build`) | OK |
| Sample `.docx` opened with Python `zipfile` | No CRC errors; every part parses as XML |

## Not yet covered

- Google Docs and LibreOffice on Windows (spike checklist §4 D and E).
- A long real session (thousands of segments) in the panel and in Word.
- Chrome blocking or cancelling a download after the click is not reported back to the panel.
