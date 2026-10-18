import type { Session } from '../shared/types';

/** Derived, in-memory only. Never persisted. */
export interface TranscriptParagraph {
  /** startedAt of the first segment in the paragraph */
  startedAt: number;
  /** segment texts joined with one U+0020 space; otherwise unchanged */
  text: string;
  /** ids of the segments in this paragraph, in order */
  segmentIds: string[];
}

export interface TranscriptTurn {
  /** exactly as stored (e.g. "نامشخص") */
  speaker: string;
  /** startedAt of the first segment in the turn */
  startedAt: number;
  /** largest updatedAt among the turn's segments */
  endedAt: number;
  /** true if any segment in the turn has final === false */
  partial: boolean;
  paragraphs: TranscriptParagraph[];
}

export interface TranscriptStats {
  /** non-empty segments included */
  segmentCount: number;
  turnCount: number;
  /** sum of Unicode code points of the included segment texts (separators excluded) */
  charCount: number;
  /** max(updatedAt) − min(startedAt) over included segments; 0 if none */
  durationMs: number;
}

export interface Transcript {
  /** the session record, passed through unchanged */
  session: Session;
  /** distinct speakers in order of first appearance */
  speakers: string[];
  turns: TranscriptTurn[];
  stats: TranscriptStats;
}
