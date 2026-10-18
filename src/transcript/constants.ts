/**
 * قواعد گروه‌بندی متن جلسه (Stage 3، Step 1). مقادیر پیش‌فرض موقت‌اند و پس از آزمون جلسهٔ واقعی تنظیم می‌شوند.
 * Presentation-only: these values never affect capture or storage.
 */
export interface GroupingRules {
  /** gap ≥ this ⇒ new turn (ms) */
  turnGapMs: number;
  /** gap ≥ this ⇒ new paragraph inside a turn (ms) */
  paragraphGapMs: number;
  /** soft limit (Unicode code points): break only between segments, after sentence punctuation */
  paragraphMaxChars: number;
}

export const TURN_GAP_MS = 120_000;
export const PARAGRAPH_GAP_MS = 20_000;
export const PARAGRAPH_MAX_CHARS = 1_200;

export const DEFAULT_GROUPING_RULES: Readonly<GroupingRules> = Object.freeze({
  turnGapMs: TURN_GAP_MS,
  paragraphGapMs: PARAGRAPH_GAP_MS,
  paragraphMaxChars: PARAGRAPH_MAX_CHARS,
});

/** Separator between segment texts inside one paragraph (U+0020). No overlap removal. */
export const JOIN_SEPARATOR = ' ';
