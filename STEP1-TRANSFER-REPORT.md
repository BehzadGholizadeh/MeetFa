# MeetFa Stage 3 / Step 1 — transfer report

Step 1 only: `buildTranscript` and speaker-turn grouping. No DOCX, download, capture, schema, repository, manifest or root-package changes. Step 2 not started.

## Base and scope

| Item | Value |
| --- | --- |
| Base commit | `56e00d59759db761db7830802b4939b943fc202a` (GitHub `main`, 17 Oct 2026). Its product files are identical to `d941d5a` (stage2.1-baseline). |
| Developer commit (local, not pushed) | `faaffc1e05287eaa8be197b24ea1513f8e130b8f` on branch `stage3/step1-build-transcript` |
| Allowed to change | `src/transcript/**` (new); new test files under `tests/` |
| Changed | 6 files, all **added**; no existing file modified |

## Files (paths relative to repo root)

| Status | File | Purpose |
| --- | --- | --- |
| A | `src/transcript/buildTranscript.ts` | Pure grouping function (rules 1–7 of the spec) |
| A | `src/transcript/constants.ts` | Provisional thresholds: 120 s turn gap, 20 s paragraph gap, 1,200 code-point soft limit; join separator U+0020 |
| A | `src/transcript/types.ts` | `Transcript`, `TranscriptTurn`, `TranscriptParagraph`, `TranscriptStats` (derived, never stored) |
| A | `tests/buildTranscript.test.ts` | 30 tests: every rule, threshold boundaries, determinism, purity, text invariant |
| A | `tests/transcriptFixture.ts` | Synthetic helpers: segment builder, 3,000-segment / ≥400,000-character fixture, seeded shuffle |
| A | `tests/schemaGuard.test.ts` | Regression gate: IndexedDB v1 name, version, stores, key paths and indexes unchanged |

## Behaviour summary

- **Input:** a `Session` plus its stored segments. Neither is mutated. The output is never persisted.
- **Blank segments:** a segment whose `text.trim()` is empty is skipped. It is not counted, its speaker is not listed, and gaps are measured from the previous non-blank segment.
- **Order:** by `startedAt`, then `id` in code-unit order.
- **Gap:** max(0, next `startedAt` − previous `updatedAt`).
- **New turn:** speaker differs (exact string) or gap ≥ 120 s.
- **New paragraph:** gap ≥ 20 s, or the paragraph already has ≥ 1,200 Unicode code points and the previous segment's text ends with `.` `؟` `?` `!`. It never splits inside a segment and has no hard limit.
- **Text:** joined with exactly one U+0020. No trimming, no de-duplication, overlap kept.
- **Partial turn:** if any of its segments has `final === false`.
- **Speakers:** distinct, in order of first appearance, exactly as stored.
- **Stats:** `segmentCount` = included segments; `charCount` = code points of included texts; `durationMs` = max `updatedAt` − min `startedAt`.

## Commands

```
# apply (choose one)
git checkout -b stage3/step1-build-transcript 56e00d59759db761db7830802b4939b943fc202a
git am 0007-stage3-step1-build-transcript.patch
#   or: unzip MeetFa-stage3-step1.zip into the repo root (adds the 6 files; the .patch file is not needed then)

npm ci
npm test            # expect: 6 test files, 80 tests passed
npx tsc --noEmit    # expect: no output
npm run build       # expect: built

# regression gate
git diff --name-status 56e00d5 HEAD                       # only the 6 added files
git diff --exit-code d941d5a HEAD -- src/content src/shared src/storage src/background src/sidepanel \
  manifest.config.ts package.json package-lock.json vite.config.ts tsconfig.json \
  tests/captionFreeze.test.ts tests/segmentTracker.test.ts tests/repositories.test.ts \
  tests/serviceWorker.test.ts tests/fixtures.ts tests/chromeMock.ts  # expect: no output
```

## Results (developer sandbox: Ubuntu, Node v22.22.2, npm 10.9.7)

| Check | Result |
| --- | --- |
| Clean `npm ci`, then `npm test` | 6 files, 80 of 80 passed (49 existing + 30 transcript + 1 schema guard) |
| Repeated runs with cache cleared | 5 of 5 passed |
| `npx tsc --noEmit` | 0 errors |
| `npm run build` | OK |
| Allowlist | PASS: 6 files, all added, all inside the allowed paths |
| Frozen files vs `d941d5a` | PASS: no diff |
| Content-script bundle vs base build | SHA-256 identical (loader, entry, `constants` chunk) |
| Whole `dist/` vs base build | All shipped files identical. Only `dist/.vite/manifest.json` differs, in one internal build-entry name (`crx-manifest.js-…`). |
| `git apply --check` and `git am` on a fresh clone at `56e00d5` | Both OK; resulting tree identical to the developer tree; tests 80/80 and build OK on that clone |
| ZIP copied onto a fresh clone at `56e00d5` | Adds only the 6 new files; tree identical to the patch result |
| Deliberate-bug check (11 mutations of `buildTranscript.ts`) | 10 caught. Not caught: removing the clamp of negative gaps to 0. With positive thresholds a negative gap behaves like 0, so the result is identical; the test checks that outcome. |

Not run: anything in a real browser. Step 1 adds no UI and is not yet imported by the extension.

## SHA-256

- `MeetFa-stage3-step1.zip`: `a5848cec76d27ef88504e17d567d805b7cb8a25de7419921325983175553ac5e`
- `0007-stage3-step1-build-transcript.patch`: `ce36c4f4f4a46f40c6684393f0fa05a6af208303ad834b88fce3a1bb3da2a11e`

## Suggested commit

Summary: `feat(stage3): Step 1 buildTranscript (speaker-turn grouping)`

Description: Pure, deterministic presentation layer over stored segments. Adds src/transcript/** and three test files only; no existing file changed. Capture, schema, repositories, manifest and root package files untouched. Tests 80/80, tsc 0 errors, build OK.

## Every test executed (80)

```
PASSED tests/buildTranscript.test.ts :: rule 1: order by startedAt, then id > sorts out-of-order input
PASSED tests/buildTranscript.test.ts :: rule 1: order by startedAt, then id > breaks startedAt ties by id (code-unit order)
PASSED tests/buildTranscript.test.ts :: rule 2–3: turns > speaker change always starts a new turn: A → B → A within 2 s gives three turns
PASSED tests/buildTranscript.test.ts :: rule 2–3: turns > speaker comparison is exact (case and spacing matter)
PASSED tests/buildTranscript.test.ts :: rule 2–3: turns > turn gap: threshold − 1 ms stays, threshold starts a new turn
PASSED tests/buildTranscript.test.ts :: rule 2–3: turns > acceptance: A resumes after 10 s → one turn, one paragraph; 25 s → new paragraph; 120 s → new turn
PASSED tests/buildTranscript.test.ts :: rule 2–3: turns > turn startedAt/endedAt: first startedAt and largest updatedAt
PASSED tests/buildTranscript.test.ts :: gap definition > negative gap (overlap) counts as 0
PASSED tests/buildTranscript.test.ts :: gap definition > gap is measured from the previous non-empty segment (empty ones are ignored)
PASSED tests/buildTranscript.test.ts :: rule 4–5: paragraphs > paragraph gap: threshold − 1 ms stays, threshold starts a new paragraph
PASSED tests/buildTranscript.test.ts :: rule 4–5: paragraphs > soft limit: breaks after sentence punctuation once the paragraph reaches the limit
PASSED tests/buildTranscript.test.ts :: rule 4–5: paragraphs > soft limit: below the limit, punctuation alone does not break
PASSED tests/buildTranscript.test.ts :: rule 4–5: paragraphs > soft limit: a 5,000-character run without punctuation stays one paragraph
PASSED tests/buildTranscript.test.ts :: rule 4–5: paragraphs > soft limit: never splits inside a segment
PASSED tests/buildTranscript.test.ts :: rule 4–5: paragraphs > soft limit counts Unicode code points, not UTF-16 units
PASSED tests/buildTranscript.test.ts :: rule 6: join without changing words > joins with exactly one U+0020 and keeps overlap at a seam
PASSED tests/buildTranscript.test.ts :: rule 6: join without changing words > keeps every character of segment text (ZWNJ, mixed script, leading/trailing spaces)
PASSED tests/buildTranscript.test.ts :: rule 7: partial turns > a turn with any non-final segment is partial
PASSED tests/buildTranscript.test.ts :: empty input and blank segments > no segments → empty transcript
PASSED tests/buildTranscript.test.ts :: empty input and blank segments > blank segments are skipped and not counted; speaker of a blank segment is not listed
PASSED tests/buildTranscript.test.ts :: empty input and blank segments > ZWNJ-only text is not blank (kept as written)
PASSED tests/buildTranscript.test.ts :: speakers and stats > speakers in order of first appearance, stored names unchanged
PASSED tests/buildTranscript.test.ts :: speakers and stats > stats: code points, counts and duration
PASSED tests/buildTranscript.test.ts :: speakers and stats > session is passed through unchanged
PASSED tests/buildTranscript.test.ts :: purity and determinism > does not mutate the input array or its segments
PASSED tests/buildTranscript.test.ts :: purity and determinism > shuffled input gives an identical result
PASSED tests/buildTranscript.test.ts :: large fixture: text invariant > fixture size is as specified
PASSED tests/buildTranscript.test.ts :: large fixture: text invariant > paragraph texts joined with one space equal the sorted non-empty segment texts joined with one space
PASSED tests/buildTranscript.test.ts :: large fixture: text invariant > every segment id appears exactly once, in sorted order
PASSED tests/buildTranscript.test.ts :: large fixture: text invariant > the fixture exercises turn breaks, paragraph breaks and soft-limit breaks
PASSED tests/captionFreeze.test.ts :: بازتولید توقف دریافت: ادامه صحبت در همان بلوک بعد از سکوت > Tracker: بعد از نهایی شدن با سکوت، متن جدید همان بلوک از دست نمی‌رود
PASSED tests/captionFreeze.test.ts :: بازتولید توقف دریافت: ادامه صحبت در همان بلوک بعد از سکوت > Tracker: چند چرخه سکوت/ادامه، و حذف ابتدای متن (scroll) بدون تکرار
PASSED tests/captionFreeze.test.ts :: بازتولید توقف دریافت: ادامه صحبت در همان بلوک بعد از سکوت > Tracker: اصلاح متن نهایی‌شده بدون محتوای جدید ⇒ segment تکراری ساخته نمی‌شود
PASSED tests/captionFreeze.test.ts :: CaptionObserver (یکپارچه با DOM، تایمر قطعی) > ادامه صحبت بعد از سکوت ۵ ثانیه‌ای به پنل می‌رسد (همان علامت گزارش تست دستی)
PASSED tests/captionFreeze.test.ts :: CaptionObserver (یکپارچه با DOM، تایمر قطعی) > جایگزینی کامل ناحیه زیرنویس توسط Meet ⇒ observer به ناحیه جدید وصل می‌شود
PASSED tests/captionFreeze.test.ts :: CaptionObserver (یکپارچه با DOM، تایمر قطعی) > ناحیه جدید در حالی که ناحیه قدیمی هنوز در DOM است ⇒ اتصال به ناحیه فعال
PASSED tests/captionFreeze.test.ts :: CaptionObserver (یکپارچه با DOM، تایمر قطعی) > وضعیت: دریافت → «در حال دریافت»، سکوت → «آماده/منتظر صحبت» (نه خطا)
PASSED tests/captionFreeze.test.ts :: CaptionObserver (یکپارچه با DOM، تایمر قطعی) > وضعیت: متن Meet رشد می‌کند ولی چیزی ثبت نمی‌شود ⇒ خطای قابل‌تشخیص؛ با بازگشت دریافت، رفع
PASSED tests/repositories.test.ts :: IndexedDB — جلسات > ایجاد با عنوان پیش‌فرض فارسی و وضعیت active
PASSED tests/repositories.test.ts :: IndexedDB — جلسات > لیست: جدیدترین اول
PASSED tests/repositories.test.ts :: IndexedDB — جلسات > تغییر نام؛ عنوان خالی نادیده گرفته می‌شود
PASSED tests/repositories.test.ts :: IndexedDB — جلسات > پایان جلسه فقط از active؛ reopen
PASSED tests/repositories.test.ts :: IndexedDB — متن‌ها > upsert: بدون تکرار، شمارنده درست، ترتیب زمانی
PASSED tests/repositories.test.ts :: IndexedDB — متن‌ها > حذف جلسه متن‌هایش را هم حذف می‌کند و به جلسه دیگر دست نمی‌زند
PASSED tests/repositories.test.ts :: بازیابی پس از کرش > جلسه active بدون تب زنده ⇒ interrupted با endedAt = آخرین متن؛ متن‌ها حفظ
PASSED tests/schemaGuard.test.ts :: IndexedDB schema guard (v1 frozen) > version and stores
PASSED tests/segmentTracker.test.ts :: mergeText > رشد متن
PASSED tests/segmentTracker.test.ts :: mergeText > اصلاح انتهای متن توسط ASR
PASSED tests/segmentTracker.test.ts :: mergeText > حذف ابتدای متن (scroll) بدون از دست رفتن
PASSED tests/segmentTracker.test.ts :: mergeText > متن جدید زیرمجموعه قبلی
PASSED tests/segmentTracker.test.ts :: mergeText > بدون تکرار در تکرار یکسان
PASSED tests/segmentTracker.test.ts :: selectors > ناحیه با برچسب انگلیسی
PASSED tests/segmentTracker.test.ts :: selectors > ناحیه با برچسب فارسی (با نیم‌فاصله)
PASSED tests/segmentTracker.test.ts :: selectors > برچسب نامرتبط
PASSED tests/segmentTracker.test.ts :: parser > گوینده و متن جدا می‌شوند؛ دکمه نادیده گرفته می‌شود
PASSED tests/segmentTracker.test.ts :: SegmentTracker > جریان کامل: رشد → اصلاح → بلوک جدید → حذف → بدون تکرار
PASSED tests/segmentTracker.test.ts :: SegmentTracker > flushAll همه را نهایی می‌کند
PASSED tests/segmentTracker.test.ts :: جلسات فارسی > رشد متن فارسی با نیم‌فاصله
PASSED tests/segmentTracker.test.ts :: جلسات فارسی > اصلاح کلمه وسط جمله توسط ASR
PASSED tests/segmentTracker.test.ts :: جلسات فارسی > حذف ابتدای متن بلند فارسی بدون از دست رفتن
PASSED tests/segmentTracker.test.ts :: جلسات فارسی > نام گوینده فارسی و متن مخلوط فارسی/انگلیسی
PASSED tests/segmentTracker.test.ts :: ساختار واقعی spike (Persian (Iran)) > ناحیه با aria-label="Captions" در جلسه فارسی
PASSED tests/segmentTracker.test.ts :: ساختار واقعی spike (Persian (Iran)) > اولویت Captions بر برچسب فارسی وقتی هر دو وجود دارند
PASSED tests/segmentTracker.test.ts :: ساختار واقعی spike (Persian (Iran)) > لایه ۱ (کلاس‌ها): گوینده و متن
PASSED tests/segmentTracker.test.ts :: ساختار واقعی spike (Persian (Iran)) > لایه ۲ (بدون کلاس، فقط ساختار): همان خروجی
PASSED tests/segmentTracker.test.ts :: ساختار واقعی spike (Persian (Iran)) > دکمه Jump to bottom و آیکون آن وارد متن نمی‌شوند
PASSED tests/segmentTracker.test.ts :: ساختار واقعی spike (Persian (Iran)) > رشد متن در ساختار واقعی بدون تکرار
PASSED tests/serviceWorker.test.ts :: Service Worker — چرخه جلسه > شروع → متن نهایی → خروج: یک جلسه ended با متن ذخیره‌شده
PASSED tests/serviceWorker.test.ts :: Service Worker — چرخه جلسه > ترتیب پیام‌ها: upsert بلافاصله بعد از START به همان جلسه می‌رسد
PASSED tests/serviceWorker.test.ts :: Service Worker — چرخه جلسه > متن زنده دقیقاً بعد از LIVE_PERSIST_MS ذخیره می‌شود (نه زودتر)
PASSED tests/serviceWorker.test.ts :: Service Worker — چرخه جلسه > رویداد دیررس: نسخه غیرنهایی، segment نهایی را بازنویسی نمی‌کند
PASSED tests/serviceWorker.test.ts :: Service Worker — بازیابی > بستن تب (pagehide → MEETING_ENDED unload، سپس onRemoved) ⇒ interrupted
PASSED tests/serviceWorker.test.ts :: Service Worker — بازیابی > Reload و شروع دوباره همان جلسه ⇒ جلسه تکراری ساخته نمی‌شود
PASSED tests/serviceWorker.test.ts :: Service Worker — بازیابی > کد جلسه متفاوت در همان تب ⇒ جلسه جدید
PASSED tests/serviceWorker.test.ts :: Service Worker — بازیابی > راه‌اندازی مجدد SW با تب زنده ⇒ جلسه active می‌ماند
PASSED tests/serviceWorker.test.ts :: Service Worker — بازیابی > بستن مرورگر/کرش (storage.session پاک) ⇒ interrupted با endedAt = آخرین متن
PASSED tests/serviceWorker.test.ts :: Service Worker — بازیابی > حذف جلسه active در لایه داده رد می‌شود؛ upsert به جلسه حذف‌شده segment یتیم نمی‌سازد
PASSED tests/serviceWorker.test.ts :: رگرسیون: همگام‌سازی تست مستقل از سرعت اجرا > با storage کند (۱۵۰ms هر خواندن)، whenIdle تا پایان واقعی پردازش صبر می‌کند
PASSED tests/serviceWorker.test.ts :: رگرسیون: همگام‌سازی تست مستقل از سرعت اجرا > whenIdle کارهایی را که حین انتظار به صف اضافه می‌شوند هم پوشش می‌دهد
PASSED tests/serviceWorker.test.ts :: رگرسیون: همگام‌سازی تست مستقل از سرعت اجرا > دو جلسه با startedAt یکسان (یک میلی‌ثانیه): هر دو با وضعیت درست ثبت می‌شوند
```
