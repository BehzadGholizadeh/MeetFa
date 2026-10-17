# Stage 3 — Step 0 spike: download path and DOCX

**Status: PARTIAL. Waiting for the owner's manual checks in real Chrome, Word, Google Docs and LibreOffice on Windows. LibreOffice-on-Linux results below do not replace those checks.**

| Item | Status |
| --- | --- |
| Branch | `spike/stage3-step0` (throwaway), from `d941d5a` (`stage2.1-baseline`) |
| Download path decision | **Pending.** Needs the real-Chrome results (A, then B) below |
| DOCX decision | **Pending.** Hand-written path passes every check that could be run here; Word and Google Docs are not yet tested |
| `downloads` permission | Not added |
| `src/**`, root `package.json`, lockfile | Unchanged |

All test content is synthetic. No real meeting data is used anywhere in the spike.

## 1. What was verified, and where

| Check | Hand-written + fflate | docx@9.8.1 | Where it was verified |
| --- | --- | --- | --- |
| ZIP valid, every XML part well-formed | Pass | Pass | Developer sandbox, `check.py` |
| Text invariant (exported paragraphs = expected text) | Pass | Pass | Developer sandbox, `check.py` |
| `w:bidi` on every paragraph | Pass | Pass | Developer sandbox |
| Section-level RTL (`w:bidi` in `sectPr`) | Pass | **Not available** in the 9.8.1 API | Developer sandbox, `index.d.ts` |
| Invalid XML characters become U+FFFD and are counted | Pass (2 of 2) | Pass (2 of 2) | Developer sandbox |
| Opens in LibreOffice and converts to PDF | Pass | Pass | LibreOffice 24.2.7.2, Linux, headless |
| Opened, edited and re-saved by LibreOffice (docx → odt → docx) | Pass | not run | LibreOffice 24.2.7.2, Linux, headless |
| Persian RTL layout | Pass | Pass | Visual check of LibreOffice renders |
| Mixed Persian and Latin | Pass with variant C (see F4) | Same behaviour as variant B | Visual check of LibreOffice renders |
| Special characters (`& < > " '`, emoji, ZWNJ, ي/ی and ك/ک, tab, U+FFFD) | Pass with an Arabic-script font (see F3) | Pass with an Arabic-script font | Visual check plus `pdftotext` |
| Realistic size: 3,000 segments, 400,608 characters, 3 speakers | Built in 203 ms (Node); 210 pages | Built in 454 ms (Node); 111 pages | Developer sandbox; LibreOffice headless convert ~10 s |
| Same bytes when built by the side-panel code | Pass (`document.xml` identical) | n/a | Node, using the extension's browser build |
| **Blob download from the side panel** | **Pending** | — | Owner, real Chrome |
| **Extension-tab fallback** | **Pending** | — | Owner, real Chrome |
| **Microsoft Word: opens without repair, editable, RTL** | **Pending** | **Pending** | Owner, Word 365 on Windows 11 |
| **Google Docs: converts, RTL kept** | **Pending** | **Pending** | Owner |
| **LibreOffice on Windows (Tahoma present)** | **Pending** | **Pending** | Owner |
| **Large file: build ≤ 5 s in the panel; opens in Word ≤ 10 s** | **Pending** (Node build 203 ms) | **Pending** | Owner, reference PC |

The sandbox environment was Ubuntu 24.04, Node v22.22.2, LibreOffice 24.2.7.2 (headless), and the DejaVu, Free and Noto Arabic fonts. Tahoma is not installed on Linux.

## 2. Dependency verification

| Package | Version | Licence | Integrity (registry = lockfile) | Contents | Dependencies | Released |
| --- | --- | --- | --- | --- | --- | --- |
| `fflate` | 0.8.3 | MIT | `sha512-tbZNuJrL…CsPvgA==` | 17 files, 796,742 bytes unpacked; browser ESM build 90,922 bytes, sha256 `b7ca4450…6122a1` | **none** | 16 May 2026 |
| `docx` | 9.8.1 | MIT | `sha512-bv4yDxgi…S08V1cA==` | 33 files, 8,996,242 bytes unpacked | 6 direct, **18 transitive** (`jszip`, `nanoid`, `xml-js`, `hash.js`, `@types/node`, …) | 28 Sep 2026 |

No package in either tree has an install script. Full output is in `spike/step0/evidence/package-audit.txt`.

## 3. Findings

- **F1. `docx@9.8.1` violates the "at least 2 weeks old" rule through its dependencies.** Two transitive packages resolve to very recent releases: `@types/node@26.6.5` (9 Oct 2026, 7 days old) and `nanoid@6.0.2` (5 Oct 2026, 11 days old). Using the library would need lockfile overrides. Its API also exposes no section-level RTL.
- **F2. `fflate@0.8.3` is small and self-contained.** It has no dependencies and no install scripts. The vendored browser build is byte-identical to the npm package (sha256 above).
- **F3. Missing glyphs in LibreOffice on Linux are a font issue, not a DOCX issue.** The DOCX asks for Tahoma as its complex-script font. Without Tahoma, LibreOffice substituted fonts that lack some glyphs, so two lines rendered as boxes. The text is still intact (`pdftotext` extracts it). With an installed Arabic-script font, every line renders correctly, including emoji, ZWNJ, ي/ی, tab and U+FFFD (`evidence/lo-B-noto-arabic.png`). Windows 11 ships Tahoma; this must be confirmed on the owner's PC.
- **F4. A paragraph that is entirely English shows its final period on the left.** This is standard Unicode bidi behaviour inside an RTL paragraph. Variant C, which gives each transcript paragraph the direction of its first strong character (like `dir="auto"` in the side panel), fixes it (`evidence/lo-C-noto-arabic-auto-dir.png`). Speaker lines and headers stay RTL. **This changes the spec rule "`w:bidi` on every paragraph" and needs approval.**
- **F5. Mixed lines read correctly.** "گزارش Q3 آماده است", "۱۴۰۵" next to "2026", and an English sentence inside a Persian paragraph all read in the expected order. Splitting runs by script (variant B) and using a single run (variant A) rendered identically in LibreOffice. Word may differ, so both are kept for the Word check.
- **F6. Size is not a concern.** The 400,608-character fixture is 149 KB as hand-written DOCX and 134 KB with the library. Build time in Node was 0.2–0.5 s. Build time in the panel and open time in Word are still to be measured.

## 4. Real-environment test checklist (owner)

None of these can be replaced by the LibreOffice-on-Linux results in this document.

**Record first:** Windows 11 build, Chrome version (`chrome://version`), Word 365 build (File → Account → About Word), LibreOffice version, and the date. Google Docs needs only the date and browser.

**Setup**

1. Get branch `spike/stage3-step0` (or the source ZIP) and run `npm ci` then `node make-download-test.mjs` in `spike/step0`.
2. In Chrome, open `chrome://extensions`, turn on Developer mode, choose Load unpacked, and select `spike/step0/download-test`. This is a separate test extension, not MeetFa.
3. Click its toolbar icon to open the side panel.

**A. Chrome: download from the side panel**

- [ ] A1 TXT: `MeetFa_spike_test.txt` appears in `chrome://downloads` and shows Persian correctly in Notepad
- [ ] A2 DOCX checks: `MeetFa_spike_checks.docx` appears
- [ ] A3 DOCX large: downloads; the panel log shows a build time of ___ ms (target ≤ 5,000 ms)
- [ ] No download prompt or warning, or note exactly what Chrome showed

**B. Chrome: extension-tab fallback (only if any A item fails)**

- [ ] B opens the extension tab
- [ ] B1, B2, B3 download as above

**C. Word 365 on Windows.** Files: `MeetFa_spike_checks.docx` (from A2), `evidence/hand-direction-samples-P2.docx`, `MeetFa_spike_large.docx` (from A3), `evidence/lib-checks.docx`

- [ ] Opens with no repair prompt; text is editable and can be saved
- [ ] Persian paragraphs right-aligned; final "." / "؟" at the left end
- [ ] Each row S1–S20 in `hand-direction-samples-P2.docx` matches the "Expected visual result" in section 7
- [ ] "گزارش Q3 آماده است", "۱۴۰۵" next to "2026", and "(نسخه 2.1)" read correctly
- [ ] `& < > " '`, emoji, half-space (ZWNJ), ي/ی and ك/ک look distinct, tab, and U+FFFD visible
- [ ] Font: Tahoma used for Persian, no boxes
- [ ] Large file opens in ___ s (target ≤ 10 s) and scrolls smoothly
- [ ] `lib-checks.docx`: same checks (fallback path)

**D. LibreOffice on Windows:** the same checks as C.

**E. Google Docs:** upload each file from C, then open with Google Docs

- [ ] Converts without error
- [ ] RTL paragraphs stay RTL; S2, S5, S6 stay LTR
- [ ] Bold speaker lines and grey times are kept
- [ ] Special characters as in C

Record pass/fail plus a screenshot for any failure in a new section 9 of this file.

## 5. Decisions to make after the manual checks

- **Download path:** if A passes, use A; if only B passes, use B; if both fail, escalate. The `downloads` permission is not requested without separate approval.
- **DOCX:** if every Word, LibreOffice and Google Docs check passes on the hand-written variant C, the recommendation is hand-written WordprocessingML + `fflate@0.8.3`. If it fails, `docx@9.8.1` is the fallback, but only with lockfile overrides for F1 and with its missing section RTL accepted. If both fail, Stage 3 ships without Word (owner decision).
- **Paragraph direction:** decided as policy P2 (section 7.1), conditional on section 4. One open point: scripts not named by the rule.

## 6. Spike commit boundaries (verified)

| Check | Result |
| --- | --- |
| Changed files vs `stage2.1-baseline` | 32 files, all added, all inside the Step 0 allowlist (`docs/spike-docx.md`, `spike/step0/**`) |
| Frozen files (`src/content/**`, `src/shared/constants.ts`, `src/shared/messages.ts`, `src/storage/db.ts`, `src/storage/repositories.ts`, 6 baseline test files) | No diff |
| `src/` and `tests/` as a whole | No diff |
| Root `package.json`, `package-lock.json`, `manifest.config.ts` | No diff; no `downloads` permission |
| Root suite after a clean `npm ci` | 49 of 49 passed: `captionFreeze` 8, `repositories` 7, `segmentTracker` 21, `serviceWorker` 13 |
| Root `npm run build` | OK |
| Content-script bundle (loader, entry and imported chunk) vs a baseline build | SHA-256 identical |

## 7. Paragraph direction: Unicode algorithm vs. MeetFa policy (P2 chosen, conditional; see 7.1)

Two different things are involved, and only the second is MeetFa's choice.

1. **Unicode Bidirectional Algorithm (UBA, UAX #9).** Word, LibreOffice and Chrome run it themselves to *display* mixed text inside a paragraph: run order, where punctuation goes, bracket mirroring, digits. MeetFa does not implement or change it. Its only input from MeetFa is the paragraph's base direction (`w:bidi` in DOCX, `dir` in the panel).
2. **MeetFa base-direction policy.** This is the product rule that picks RTL or LTR for each transcript paragraph. UAX #9's own "first strong character" rule (P2–P3) is just one candidate policy, and it fails Persian sentences that start with a Latin word (S3, S16). **No policy has been adopted yet. No new algorithm has been implemented in product code.**

**Evidence:** `spike/step0/direction/` holds `samples.json`, `policies.py` (analysis only, Unicode 15.0 `Bidi_Class` via Python) and `render_samples.py`. The outputs are `evidence/direction-policy-results.txt`, `evidence/direction-samples.docx`, and `evidence/direction-render-1..3.png` (each sample in both base directions, rendered by LibreOffice 24.2 on Linux). Word and Google Docs rendering has not been tested.

### Decision table

"Expected base" is the product expectation. The "?" entries for S18–S20 were resolved to RTL by the owner's P2 decision (7.1). This table is kept as it was when the decision was made. Expected visual results were checked against the LibreOffice renders.

| Id | Text | Expected base | Expected visual result (with the expected base) | Visual result with the other base |
| --- | --- | --- | --- | --- |
| S1 | سلام به همه، جلسه رو شروع می‌کنیم. | RTL | Right-aligned; "." at the left end | Left-aligned; "." on the wrong (right) side |
| S2 | The deadline is Friday, October 30. | LTR | Left-aligned; "." at the right end | Right-aligned; "." jumps to the left of "The" |
| S3 | API در این سرویس استفاده می‌شود. | RTL | "API" is the rightmost word; Persian continues leftwards; "." at the left end | "API" at the left, "." after "در" on the right: reading order broken |
| S4 | این نسخه OpenAI v2.4.0 است. | RTL | "این نسخه" at the right, then "OpenAI v2.4.0" (version intact), then "است", "." at the left end | Word order reversed for a Persian reader |
| S5 | Η προθεσμία είναι την Παρασκευή. | LTR | Left-aligned; "." at the right end | "." jumps to the left |
| S6 | Срок сдачи — в пятницу. | LTR | Left-aligned; "." at the right end | "." jumps to the left |
| S7 | המועד האחרון הוא ביום שישי. | RTL | Right-aligned; "." at the left end | "." on the wrong side |
| S8 | 2026 | RTL (no letters) | Right-aligned; digits unchanged | Left-aligned |
| S9 | ۱۴۰۵ | RTL (no letters) | Right-aligned; digits unchanged | Left-aligned |
| S10 | 👋🏽 ✅ | RTL (no letters) | Right-aligned; 👋🏽 rightmost, ✅ to its left | 👋🏽 leftmost |
| S11 | ۱۴۰۵ / 2026 | RTL (no letters) | "۱۴۰۵" rightmost, "/", "2026" leftmost; each number keeps its digit order | "۱۴۰۵" leftmost |
| S12 | آیا نسخهٔ API آماده است؟ | RTL | "؟" at the left end; "API" between "نسخهٔ" and "آماده" | Clause order broken |
| S13 | گزارش در فایل (report.pdf) است. | RTL | "(report.pdf)" between "فایل" and "است", brackets correctly mirrored; "." at the left end | Order broken |
| S14 | این را ببین: OpenAI v2.4.0. | RTL | ":" just left of "ببین", then "OpenAI v2.4.0", final "." at the far left | ":" and "." misplaced |
| S15 | (نسخه 2.1) | RTL | Brackets enclose "نسخه 2.1" correctly; right-aligned | Also readable; left-aligned |
| S16 | API v2 در OpenAI SDK است. | RTL | "API v2" rightmost, "در", "OpenAI SDK", "است", "." at the left end | Order broken |
| S17 | خروجی رو بفرست به API. | RTL | "API" left of "به", "." at the far left | Order broken |
| S18 | Please send the file to مریم by Friday. | LTR ? | Normal English; "مریم" as an RTL island; "." at the right end | Clauses reversed: "by Friday" at the left, "Please send…" at the right |
| S19 | Ask مریم and علی to review the PR. | LTR ? | Normal English with two RTL islands | Clauses reversed |
| S20 | He said: سلام دوستان! | ? | RTL: "He said" at the right, ":" to its left, "!" at the left end. LTR: "He said:" at the left, "!" at the right end | Both readable |

### Candidate policies tested against the table

Every policy treats "no strong letter" as RTL, the document base. ✓ means it matches the expected base; ✗ means it does not.

| Policy | Firm-case failures | Failures if S18/S19 must be LTR | Notes |
| --- | --- | --- | --- |
| P1 UAX #9 first strong letter | **S3, S16** | none | Fails the owner's "API …" case |
| P2 any RTL letter → RTL, else any LTR letter → LTR | none | **S18, S19** | No threshold; simplest; Persian-first |
| Word share of RTL ≥ 20% (Gemini's proposal) | none | **S19** (share 0.25) | 20% is not supported by these samples |
| Word share ≥ 30% | none | none | Passes only because 0.25 < 30% ≤ 0.333 |
| Word share ≥ 50% (majority) | **S16** (share 0.333) | none | |
| Letter share ≥ 20% | none | **S19** (0.269) | |
| Last strong letter | **S14, S17** | none | Fails Persian sentences that end with a Latin word |

Word-share sweep from 5% to 95%: the only thresholds with no failures at all are those above 0.25 and at or below 0.333. That window comes from 20 synthetic sentences, so it is overfitted and is **not** proposed.

### Conclusion and the decision needed

- **The decision rests on one product question:** may an English sentence that only contains Persian names (S18, S19) or a short Persian quote (S20) be shown RTL?
  - **If yes:** P2 passes every firm case with no threshold and no tuning. It is the recommended policy.
  - **If no:** no rule tested here is safe. A threshold would have to be calibrated on real (owner-approved, anonymized) transcripts before it is adopted.
- **Implementation after the decision (Step 4, not now):** the chosen policy, the "no strong letter → RTL" rule, and every row of this table become unit tests. Production uses `Bidi_Class` data from the pinned UCD file described in the spec, not the spike's regex. The side panel should use the same policy later (Step 2) instead of `dir="auto"`, which equals P1.
- **Still unverified:** all download and DOCX claims in sections 1–5 remain unconfirmed until the real Chrome and Windows Office tests are done.

### 7.1 Decision recorded: policy P2 (conditional on the real-environment tests)

The owner chose P2 as the product decision. It stays conditional until section 4 is completed.

**Rules**

1. At least one Persian, Arabic or Hebrew **letter** → base **RTL**.
2. Otherwise, at least one Latin, Greek or Cyrillic **letter** → base **LTR**.
3. Otherwise (no such letter) → base **RTL** (document default).
4. Display of mixed text and punctuation is left to the Unicode Bidi Algorithm in Word, LibreOffice and Chrome. MeetFa never rewrites, reorders or adds characters. The text invariant tests in sections 1 and 6 confirm this for every spike file.

**Exact definitions used in the spike** (`spike/step0/direction/p2.mjs`)

- **Letter:** Unicode General_Category L (`\p{L}`). Digits (including ۰–۹ and ٠–٩), punctuation, emoji, combining marks, ZWNJ and tatweel are not letters.
- **Script:** the Unicode Script property as known to the JavaScript engine: `Arabic` or `Hebrew` for rule 1; `Latin`, `Greek` or `Cyrillic` for rule 2. Regex: `/[\p{L}&&[\p{Script=Arabic}\p{Script=Hebrew}]]/v`. The `v` flag requires Chrome 112+, and the manifest minimum is 116.
- **Isolates** (LRI/RLI/FSI…PDI) get no special treatment; P2 only asks whether a letter exists.
- **Unicode version:** the engine's own. The spike ran on Node 22.22.2 (Unicode 17.0). Chrome's version may be older, which only matters for characters added recently.

**P2 results on all current samples** (`node --test direction/p2.test.mjs`: 45 of 45 pass, output in `evidence/p2-test-results.txt`)

| Ids | P2 base | Matches expected |
| --- | --- | --- |
| S1, S3, S4, S7, S12–S17 | RTL | yes |
| S2, S5, S6 | LTR | yes |
| S8–S11 (no letters) | RTL | yes |
| S18, S19, S20 | RTL | yes. These were "LTR ?" / "?" before the decision; the owner accepts RTL. Visual result: English clauses appear in reversed order around the Persian name, as shown in `evidence/p2-render-3.png` |

**Edge cases also tested:** empty text; spaces only; ZWNJ only; Arabic-Indic digits; tatweel only; U+FFFD; emoji ZWJ sequence; punctuation only; Arabic ligature U+FDF2; presentation form U+FEFB; Persian with harakat; Arabic ي/ك; Hebrew with niqqud; Latin with a combining accent; fullwidth Latin; Greek; Cyrillic; Latin followed by Hebrew; isolates; CJK followed by Latin.

**Open point (needs the owner):** letters of scripts the rule does not name (Syriac, Thaana, CJK, Devanagari, …) are currently ignored. A paragraph containing *only* such letters therefore becomes RTL by rule 3. Confirm, or extend the rule (for example, other RTL scripts → RTL, all other letters → LTR).

**Evidence for this decision:** `evidence/hand-checks-P2.docx` (its `document.xml` is byte-identical to variant C, so earlier test files stay valid); `evidence/hand-direction-samples-P2.docx` (S1–S20 built by the candidate exporter with P2); `evidence/p2-render-1..3.png` (LibreOffice on Linux, rendered with an installed Arabic-script font instead of Tahoma, for evidence only). The download-test extension now uses P2 as well; its build is byte-identical to the Node build.

**Not done:** no product code, no Step 1. Production will use the same rule with the same tests in Step 4 (DOCX) and later in the panel (Step 2), after approval.

## 8. Repository status (as of 17 Oct 2026)

- `origin/main` is at `c22d254`. That single commit contains the content of the two spike commits (`00e0073`, `69df571`) squashed together, plus two extra files in the repo root: `0005-spike-direction-decision-table.patch` and `MeetFa-spike-step0.bundle`. Product files (`src/`, `tests/`, manifest, root package files) on `main` are unchanged from `d941d5a`.
- Branch `spike/stage3-step0` is **not** on GitHub. Its commits (`00e0073`, `69df571`, plus the P2 commit) are available only in the delivered bundle.
- The P2 commit changes only `docs/spike-docx.md` and `spike/step0/**`. Those files are identical on `main` and on the spike branch, so the patch applies to either.
