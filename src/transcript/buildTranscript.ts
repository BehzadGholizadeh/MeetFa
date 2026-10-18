import type { Segment, Session } from '../shared/types';
import { DEFAULT_GROUPING_RULES, JOIN_SEPARATOR, type GroupingRules } from './constants';
import type { Transcript, TranscriptParagraph, TranscriptTurn } from './types';

/**
 * Builds the derived speaker-turn presentation from stored segments (spec: "Transcript grouping rules").
 * Pure and deterministic: never mutates its input, never changes, removes or adds words.
 *
 * 1. Skip segments whose text is empty or whitespace-only.
 * 2. Sort by startedAt, then id (code-unit order).
 * 3. gap = max(0, next.startedAt − prev.updatedAt) between adjacent included segments.
 * 4. New turn: speaker differs (exact string) or gap ≥ turnGapMs.
 * 5. New paragraph: gap ≥ paragraphGapMs, or (paragraph has ≥ paragraphMaxChars code points
 *    and the previous segment's text ends with . ؟ ? !). Never splits inside a segment.
 * 6. Join texts inside a paragraph with one U+0020 space.
 * 7. Turn is partial if any of its segments is not final.
 */
export function buildTranscript(
  session: Session,
  segments: readonly Segment[],
  rules: GroupingRules = DEFAULT_GROUPING_RULES,
): Transcript {
  const included = segments.filter((s) => !isBlank(s.text)).sort(compareSegments);

  const turns: TranscriptTurn[] = [];
  const speakers: string[] = [];
  let turn: TranscriptTurn | undefined;
  let paragraph: TranscriptParagraph | undefined;
  let paragraphChars = 0;
  let prev: Segment | undefined;
  let charCount = 0;
  let minStart = Infinity;
  let maxUpdate = -Infinity;

  for (const seg of included) {
    const len = codePointLength(seg.text);
    charCount += len;
    minStart = Math.min(minStart, seg.startedAt);
    maxUpdate = Math.max(maxUpdate, seg.updatedAt);
    if (!speakers.includes(seg.speaker)) speakers.push(seg.speaker);

    const gap = prev ? Math.max(0, seg.startedAt - prev.updatedAt) : 0;

    if (!turn || !paragraph || !prev || seg.speaker !== turn.speaker || gap >= rules.turnGapMs) {
      paragraph = newParagraph(seg);
      turn = { speaker: seg.speaker, startedAt: seg.startedAt, endedAt: seg.updatedAt, partial: !seg.final, paragraphs: [paragraph] };
      turns.push(turn);
      paragraphChars = len;
    } else {
      const softBreak = paragraphChars >= rules.paragraphMaxChars && SENTENCE_END.test(prev.text);
      if (gap >= rules.paragraphGapMs || softBreak) {
        paragraph = newParagraph(seg);
        turn.paragraphs.push(paragraph);
        paragraphChars = len;
      } else {
        paragraph.text += JOIN_SEPARATOR + seg.text;
        paragraph.segmentIds.push(seg.id);
        paragraphChars += 1 + len;
      }
      turn.endedAt = Math.max(turn.endedAt, seg.updatedAt);
      turn.partial ||= !seg.final;
    }
    prev = seg;
  }

  return {
    session,
    speakers,
    turns,
    stats: {
      segmentCount: included.length,
      turnCount: turns.length,
      charCount,
      durationMs: included.length ? Math.max(0, maxUpdate - minStart) : 0,
    },
  };
}

/** Sentence-ending punctuation for the soft paragraph limit (last character of the previous segment). */
export const SENTENCE_END = /[.؟?!]$/u;

export function compareSegments(a: Segment, b: Segment): number {
  if (a.startedAt !== b.startedAt) return a.startedAt - b.startedAt;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function isBlank(text: string): boolean {
  return text.trim().length === 0;
}

function codePointLength(text: string): number {
  let n = 0;
  for (const _ of text) n++;
  return n;
}

function newParagraph(seg: Segment): TranscriptParagraph {
  return { startedAt: seg.startedAt, text: seg.text, segmentIds: [seg.id] };
}
