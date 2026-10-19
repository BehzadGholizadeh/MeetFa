import { getSegments, getSession } from '../storage/repositories';
import { buildTranscript } from '../transcript/buildTranscript';
import { buildTranscriptDocx, DOCX_MIME } from './docx';
import { saveFile } from './download';
import { docxFileName } from './filename';

export type ExportResult =
  | { status: 'ok'; fileName: string; turns: number; replaced: number; ms: number }
  | { status: 'empty' }
  | { status: 'missing' };

/**
 * Reads the stored session (read-only), builds the .docx in the panel and starts the download.
 * Nothing is sent anywhere and nothing is written to storage. Read, build and download errors are thrown.
 */
export async function exportSessionDocx(sessionId: string): Promise<ExportResult> {
  const session = await getSession(sessionId);
  if (!session) return { status: 'missing' };
  const segments = await getSegments(sessionId);
  const t0 = performance.now();
  const transcript = buildTranscript(session, segments);
  if (!transcript.turns.length) return { status: 'empty' };
  const { bytes, replaced } = buildTranscriptDocx(transcript);
  const fileName = docxFileName(session.title, session.startedAt);
  saveFile(bytes, fileName, DOCX_MIME);
  const ms = performance.now() - t0;
  console.debug(
    `[MeetFa] perf docx: ${transcript.stats.segmentCount} segments, ${transcript.turns.length} turns, ${bytes.length} bytes, ${ms.toFixed(0)} ms`,
  );
  return { status: 'ok', fileName, turns: transcript.turns.length, replaced, ms };
}
