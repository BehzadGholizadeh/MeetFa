# MeetFa Stage 3 / Step 2 — Side Panel transcript turns: report

Step 2 only. Step 3 not started. No Git operations were performed on your repository; in my sandbox I used `git diff` only to produce the patch (no commit, no push).

## 1. Summary

- The history transcript view ("مشاهده متن") now renders **speaker turns from Step 1's `buildTranscript`**, instead of one block per raw segment.
- Each turn shows:
  - the speaker, exactly as stored
  - the turn start time in fa-IR, inside `<time datetime=ISO>`
  - " (ناتمام)" for partial turns, placed beside the time and never inside the text
  - one paragraph element per paragraph
- Paragraph text is set with `textContent`, exactly as returned by the presentation layer. CSS `white-space: pre-wrap` keeps spaces and tabs visible.
- Empty state "این جلسه متنی ندارد." appears when there are no usable segments. Blank-only segments count as none.
- If reading or rendering fails, a message appears and nothing is written to storage.
- A stale-render guard stops a slow, older load from overwriting a newer view or reopening after "بازگشت".
- The live tab is unchanged; it still uses `segmentView`.
- Long sessions use **F1**: CSS `content-visibility: auto` on each turn. F2 ("نمایش ادامه") is not implemented, because F1 has not been measured as failing (section 5).
- `performance.mark` timings are logged to the console as `[MeetFa] perf` for manual measurement.

## 2. Base and files

- **Base:** `4341e57772384d32fe00fb3d4ee8bf1d64e17aa0` (GitHub `main`). Step 1 is present; its API was used unchanged.

| Status | File | Why |
| --- | --- | --- |
| M | `src/sidepanel/history.ts` | `openDetail` builds the transcript and renders turns; empty and error states; stale-render guard; perf log |
| M | `src/sidepanel/segmentView.ts` | New `turnView()` and `PARTIAL_MARKER`; `segmentView` kept for the live tab |
| M | `src/sidepanel/style.css` | Turn styles plus F1 (`content-visibility`); appended only, existing rules untouched |
| A | `tests/sidepanelTranscript.test.ts` | New tests (existing tests untouched) |

## 3. Tests (new file, 14 tests)

The repository layer is mocked in memory. `history.ts` is driven through its real UI: the list's "مشاهده متن" button and "بازگشت".

| # (brief) | Test |
| --- | --- |
| 1 | Turn count equals `buildTranscript` turns (3) |
| 2 | Speakers exactly as stored; 2b: speaker not trimmed |
| 3 | Time text = fa-IR start time; `datetime` = ISO start |
| 4 | " (ناتمام)" only on partial turns and not inside the paragraph text |
| 5 | Empty session, and blank-only session → empty state |
| 6 | Shuffled storage order still renders chronologically, with the same paragraphs as `buildTranscript` |
| 7 | F2 not implemented, so no test |
| 8 | Rendered text equals the presentation text: leading/trailing spaces, ZWNJ, repeated words, «»، ؟!, emoji, tab; joined text equals the raw segments joined |
| extra | No storage write function called, and segments not mutated, when opening a transcript |
| extra | Read failure → error message, no writes |
| extra | Stale-render guard |
| extra | `turnView`: one `<p dir="auto">` per paragraph; markup in speech shown as text, not parsed |

**Deliberate-bug check:** 13 deliberate rendering bugs; all 13 make at least one test fail.
- trimming the text or the speaker
- de-duplicating repeated words
- no partial marker
- showing the end time
- reversed order
- dropped turns
- no empty state
- `dir` not auto
- `innerHTML`
- no stale guard

## 4. Results (actually run in the developer sandbox: Ubuntu, Node v22.22.2, npm 10.9.7)

| Check | Result |
| --- | --- |
| Clean `npm ci` then `npm test` | 7 files, 94 of 94 passed (80 existing + 14 new); 3 more runs with cache cleared, all passed |
| `npx tsc --noEmit` | 0 errors |
| `npm run build` | OK |
| Allowlist (vs `4341e57`) | Only the 3 allowed files modified, plus 1 new test file |
| Frozen vs `d941d5a` | `src/content`, `src/shared`, `src/storage`, `src/background`, manifest, root package files, vite/ts config, baseline tests: no diff |
| Step 1 files, `src/sidepanel/main.ts`, `index.html` | Unchanged |
| Content-script bundle vs a base build | SHA-256 identical; built manifest permissions, host permissions, content scripts and background identical |
| Patch on a fresh clone at `4341e57` | `git apply --check` and apply OK; files identical to the developer's |
| With review patch `0008` also applied | Both apply; 97 of 97 tests, tsc 0 errors, build OK |

## 5. Performance

**No Chrome target has been measured.** No browser exists in the developer sandbox and browser downloads are blocked, so none of the four targets is claimed as passed.

**What was measured (jsdom, not representative of Chrome; no layout or paint):** 3,000-segment fixture, ≥400,000 characters, 3 speakers, giving 765 turns and 896 paragraphs.

| Measure | 6 runs |
| --- | --- |
| `buildTranscript` | 7.5–20.2 ms |
| DOM construction | 114–469 ms |
| Elements created | 3,956 |

**Manual measurement in your Chrome:**
1. Build and load the extension. Open the side panel, right-click it, choose Inspect, then open Console with Verbose enabled.
2. Paste the seeding snippet below. It writes one **synthetic** session (3,000 segments, about 400,000 characters) into MeetFa's IndexedDB. Delete it afterwards with "حذف".
3. Go to "جلسات قبلی" and click "مشاهده متن" on "PERF TEST". The console shows `[MeetFa] perf transcript: … dom X ms, paint Y ms`.
   - First turn visible ≈ paint, target ≤ 1 s.
   - Full render ≈ paint, because all turns are inserted at once; target ≤ 2 s.
4. DevTools Performance: record a 10 s scroll. Target: no task over 200 ms.
5. DevTools Memory: heap snapshot or Performance monitor. Target: under 150 MB.
6. Do 1 warm-up run, then 5 measured runs. Record the median, the maximum, and the PC and Chrome versions.
7. If a target fails, report it. F2 ("نمایش ادامه", 200 turns at a time) is the planned fallback.

```js
(async () => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open('meetfa', 1); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const id = 'perf-' + Date.now(); const start = Date.now() - 3 * 3600e3;
  const words = ['جلسه','گزارش','بودجه','برنامه','پروژه','تیم','API','Q3','۱۴۰۵','2026','و','در','با','که','است'];
  const speakers = ['گوینده ۱', 'Speaker 2', 'گوینده ۳'];
  const tx = db.transaction(['sessions', 'segments'], 'readwrite');
  let t = start;
  for (let i = 0; i < 3000; i++) {
    let text = ''; while (text.length < 131) text += (text ? ' ' : '') + words[(i * 7 + text.length) % words.length];
    tx.objectStore('segments').put({ id: `${id}-${String(i).padStart(5, '0')}`, sessionId: id, speaker: speakers[Math.floor(i / 4) % 3], text, startedAt: t, updatedAt: t + 2800, final: true });
    t += 3400 + (i % 20 === 0 ? 25000 : 0);
  }
  tx.objectStore('sessions').put({ id, title: 'PERF TEST — 3000 segments (synthetic)', meetCode: 'perf-test-000', startedAt: start, endedAt: t, status: 'ended', segmentCount: 3000 });
  await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
  console.log('seeded', id);
})();
```

## 6. Known limitations and unverified behaviour

- **Not verified in a real browser:** rendering, RTL appearance, F1 effectiveness, and all four performance targets.
- **Direction:** paragraphs use the existing panel convention `dir="auto"` (first strong character). The spec says the panel should eventually use the P2 policy. P2 currently exists only in the spike, and putting it in product code needs a new shared module outside this step's allowed files, so it was **not** done. With `dir="auto"`, "API در این سرویس…" displays LTR in the panel (exports are unaffected). This needs approval as a separate change.
- **Time:** only the turn start time is shown. The end time is in the data but not displayed.
- **Live view:** the "زنده" tab still shows raw segments. Turn grouping there is an optional enhancement, not in this step.
- **Active session:** its transcript view is a snapshot when opened, unchanged from before.

## 7. Frozen files

Confirmed unchanged: `src/content/**`, `src/shared/constants.ts`, `src/shared/messages.ts`, `src/storage/db.ts`, `src/storage/repositories.ts`, IndexedDB schema/version, `manifest.config.ts`, `package.json`, `package-lock.json`, and every baseline test file. The content-script build output is byte-identical.

## Apply

```
git checkout -b stage3/step2-sidepanel-turns 4341e57
git apply 0009-stage3-step2-sidepanel-turns.patch      # or copy the 4 files from the ZIP
npm ci && npm test && npx tsc --noEmit && npm run build
```

## Every test executed (94)

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
PASSED tests/sidepanelTranscript.test.ts :: transcript view renders buildTranscript turns > 1. renders one element per turn, matching buildTranscript
PASSED tests/sidepanelTranscript.test.ts :: transcript view renders buildTranscript turns > 2. shows each turn’s speaker exactly as stored
PASSED tests/sidepanelTranscript.test.ts :: transcript view renders buildTranscript turns > 2b. speaker text is not trimmed or normalised
PASSED tests/sidepanelTranscript.test.ts :: transcript view renders buildTranscript turns > 3. shows the turn start time (fa-IR) with a machine-readable datetime
PASSED tests/sidepanelTranscript.test.ts :: transcript view renders buildTranscript turns > 4. marks only partial turns with “ (ناتمام)”, outside the transcript text
PASSED tests/sidepanelTranscript.test.ts :: transcript view renders buildTranscript turns > 6. keeps chronological order even when storage returns segments shuffled
PASSED tests/sidepanelTranscript.test.ts :: transcript view renders buildTranscript turns > 8. rendered paragraph text is exactly the presentation-layer text (spaces, ZWNJ, repeats, punctuation kept)
PASSED tests/sidepanelTranscript.test.ts :: transcript view renders buildTranscript turns > opening a transcript never writes to storage and does not mutate the segments
PASSED tests/sidepanelTranscript.test.ts :: empty and error states > 5. a session with no segments shows the empty state
PASSED tests/sidepanelTranscript.test.ts :: empty and error states > 5b. a session with only blank segments shows the empty state
PASSED tests/sidepanelTranscript.test.ts :: empty and error states > a failing read shows an error message and writes nothing
PASSED tests/sidepanelTranscript.test.ts :: stale render guard > a slow read that finishes after the user went back does not reopen or fill the transcript
PASSED tests/sidepanelTranscript.test.ts :: turnView > builds speaker, time, optional marker and one <p dir="auto"> per paragraph
PASSED tests/sidepanelTranscript.test.ts :: turnView > uses textContent only (markup in speech is shown as text, not parsed)
```
