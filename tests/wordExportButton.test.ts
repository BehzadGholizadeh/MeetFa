import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session, StoredSegment } from '../src/shared/types';
import { DOCX_MIME } from '../src/export/docx';
import { openDocx, bodyParagraphs } from './docxHelpers';
import { SESSION, seg } from './transcriptFixture';

/** In-memory storage; write functions are spies that the export must never call. */
const store = vi.hoisted(() => ({
  session: null as Session | null,
  segments: [] as StoredSegment[],
  /** fail getSegments from the Nth call on (1-based); 0 = never */
  failSegmentsFrom: 0,
  calls: 0,
}));
vi.mock('../src/storage/repositories', () => ({
  listSessions: vi.fn(async () => (store.session ? [store.session] : [])),
  getSession: vi.fn(async () => store.session ?? undefined),
  getSegments: vi.fn(async () => {
    store.calls++;
    if (store.failSegmentsFrom && store.calls >= store.failSegmentsFrom) throw new Error('read failed');
    return store.segments;
  }),
  renameSession: vi.fn(),
  deleteSession: vi.fn(),
  upsertSegments: vi.fn(),
  endSession: vi.fn(),
  createSession: vi.fn(),
}));

let history: typeof import('../src/sidepanel/history');
let repos: typeof import('../src/storage/repositories');
const blobs: Blob[] = [];
const clicks: { download: string; href: string }[] = [];

beforeAll(async () => {
  // Same element ids as src/sidepanel/index.html (history view only).
  document.body.innerHTML = `
    <div id="history-list" class="feed"></div>
    <div id="history-detail" class="detail-view" hidden>
      <button id="back" class="link">→ بازگشت به لیست</button>
      <h2 id="detail-title"></h2><p id="detail-meta" class="meta"></p>
      <div class="detail-actions">
        <button id="export-word" class="btn" type="button" disabled>دریافت فایل Word</button>
        <span id="export-status" class="meta" role="status"></span>
      </div>
      <div id="detail-feed" class="feed"></div>
    </div>`;
  history = await import('../src/sidepanel/history');
  repos = await import('../src/storage/repositories');
});

beforeEach(() => {
  // jsdom has no object URLs and does not navigate on <a download> clicks.
  URL.createObjectURL = vi.fn((b: Blob) => (blobs.push(b), `blob:meetfa/${blobs.length}`));
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    clicks.push({ download: this.download, href: this.href });
  });
});

afterEach(() => {
  (document.getElementById('back') as HTMLButtonElement).click();
  Object.assign(store, { session: null, segments: [], failSegmentsFrom: 0, calls: 0 });
  blobs.length = 0;
  clicks.length = 0;
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

const button = () => document.getElementById('export-word') as HTMLButtonElement;
const status = () => document.getElementById('export-status')!;

async function open(session: Session, segments: StoredSegment[]): Promise<void> {
  store.session = session;
  store.segments = segments;
  await history.refreshHistory();
  [...document.querySelectorAll<HTMLButtonElement>('#history-list button')].find((b) => b.textContent === 'مشاهده متن')!.click();
  await vi.waitFor(() => expect(document.getElementById('detail-feed')!.textContent).not.toBe(''));
}

async function exportAndWait(): Promise<void> {
  button().click();
  await vi.waitFor(() => expect(status().textContent).not.toBe(history.EXPORT_MSG.busy));
}

const readBlob = (b: Blob) =>
  new Promise<Uint8Array>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(new Uint8Array(r.result as ArrayBuffer));
    r.onerror = () => reject(r.error);
    r.readAsArrayBuffer(b);
  });

describe('“دریافت فایل Word” button', () => {
  const segments = [
    seg('مریم احمدی', 'سلام به همه.', 0),
    seg('John Smith', 'The deadline is Friday.', 5_000),
    seg('مریم احمدی', 'گزارش Q3 آماده است.', 10_000),
  ];

  it('is shown in the detail view and enabled once a non-empty transcript is open', async () => {
    await open(SESSION, segments);
    expect(button().textContent).toBe('دریافت فایل Word');
    expect(button().disabled).toBe(false);
  });

  it('downloads a valid .docx named after the title, built from the stored transcript', async () => {
    await open(SESSION, segments);
    await exportAndWait();
    expect(clicks).toEqual([{ download: `${SESSION.title}.docx`, href: 'blob:meetfa/1' }]);
    expect(blobs[0].type).toBe(DOCX_MIME);
    const { doc } = openDocx(await readBlob(blobs[0]));
    expect(bodyParagraphs(doc).filter((p) => p.style !== 'Speaker').map((p) => p.text)).toEqual(segments.map((s) => s.text));
    expect(status().textContent).toBe(history.EXPORT_MSG.started(`${SESSION.title}.docx`));
    expect(status().dataset.kind).toBeUndefined();
    expect(button().disabled).toBe(false);
  });

  it('uses a safe file name when the title has invalid characters', async () => {
    await open({ ...SESSION, title: 'Sync: Q3/Q4 <نهایی>?' }, segments);
    await exportAndWait();
    expect(clicks[0].download).toBe('Sync Q3 Q4 نهایی.docx');
  });

  it('never writes to storage', async () => {
    await open(SESSION, segments);
    await exportAndWait();
    for (const fn of [repos.renameSession, repos.deleteSession, repos.upsertSegments, repos.endSession, repos.createSession]) {
      expect(fn).not.toHaveBeenCalled();
    }
  });

  it('is disabled for a session without text', async () => {
    await open(SESSION, [seg('A', '  ', 0)]);
    expect(button().disabled).toBe(true);
    expect(button().title).toBe(history.EXPORT_MSG.empty);
  });

  it('a session that became empty after opening reports “no text” and downloads nothing', async () => {
    await open(SESSION, segments);
    store.segments = [];
    await exportAndWait();
    expect(status().textContent).toBe(history.EXPORT_MSG.empty);
    expect(clicks).toHaveLength(0);
  });

  it('a session deleted after opening reports that it no longer exists', async () => {
    await open(SESSION, segments);
    store.session = null;
    await exportAndWait();
    expect(status().textContent).toBe(history.EXPORT_MSG.missing);
    expect(clicks).toHaveLength(0);
  });

  it('a storage read error during export shows an error and keeps the transcript visible', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await open(SESSION, segments);
    store.failSegmentsFrom = store.calls + 1;
    await exportAndWait();
    expect(status().textContent).toBe(history.EXPORT_MSG.failed);
    expect(status().dataset.kind).toBe('error');
    expect(err).toHaveBeenCalledWith('[MeetFa] Word export failed', expect.any(Error));
    expect(document.querySelectorAll('#detail-feed article.turn')).toHaveLength(3);
    expect(button().disabled).toBe(false);
  });

  it('a download failure (Blob URL rejected) shows an error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await open(SESSION, segments);
    URL.createObjectURL = vi.fn(() => {
      throw new Error('blocked');
    });
    await exportAndWait();
    expect(status().textContent).toBe(history.EXPORT_MSG.failed);
    expect(clicks).toHaveLength(0);
  });

  it('a failing click still removes the link and schedules the URL revoke', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    try {
      await open(SESSION, segments);
      vi.mocked(HTMLAnchorElement.prototype.click).mockImplementation(() => {
        throw new Error('click failed');
      });
      await exportAndWait();
      expect(status().textContent).toBe(history.EXPORT_MSG.failed);
      expect(document.querySelector('a[download]')).toBeNull();
      vi.advanceTimersByTime(60_000);
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:meetfa/1');
    } finally {
      vi.useRealTimers();
    }
  });

  it('going back clears the status; opening another session does not show the old message', async () => {
    await open(SESSION, segments);
    await exportAndWait();
    (document.getElementById('back') as HTMLButtonElement).click();
    expect(status().textContent).toBe('');
    await open({ ...SESSION, id: 'sess-2', title: 'دیگری' }, segments);
    expect(status().textContent).toBe('');
  });
});
