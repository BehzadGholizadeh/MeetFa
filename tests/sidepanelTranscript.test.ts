import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Session, StoredSegment } from '../src/shared/types';
import { buildTranscript } from '../src/transcript/buildTranscript';
import { PARTIAL_MARKER, timeFmt, turnView } from '../src/sidepanel/segmentView';
import { SESSION, seg, shuffled } from './transcriptFixture';

/** In-memory stand-in for the storage layer; write functions are spies that must never be called by the view. */
const store = vi.hoisted(() => ({ session: null as Session | null, segments: [] as StoredSegment[], failSession: false, failSegments: false, gate: null as Promise<void> | null }));
vi.mock('../src/storage/repositories', () => ({
  listSessions: vi.fn(async () => (store.session ? [store.session] : [])),
  getSession: vi.fn(async () => {
    if (store.failSession) throw new Error('session read failed');
    return store.session ?? undefined;
  }),
  getSegments: vi.fn(async () => {
    if (store.gate) await store.gate;
    if (store.failSegments) throw new Error('read failed');
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

beforeAll(async () => {
  // Same element ids as src/sidepanel/index.html (history view only).
  document.body.innerHTML = `
    <div id="history-list" class="feed"></div>
    <div id="history-detail" class="detail-view" hidden>
      <button id="back" class="link">→ بازگشت به لیست</button>
      <h2 id="detail-title"></h2><p id="detail-meta" class="meta"></p>
      <div id="detail-feed" class="feed"></div>
    </div>`;
  history = await import('../src/sidepanel/history');
  repos = await import('../src/storage/repositories');
});

afterEach(() => {
  (document.getElementById('back') as HTMLButtonElement).click(); // back to list, reset view state
  store.session = null;
  store.segments = [];
  store.failSession = false;
  store.failSegments = false;
  store.gate = null;
  vi.clearAllMocks();
});

const feed = () => document.getElementById('detail-feed')!;
const turns = () => [...feed().querySelectorAll<HTMLElement>('article.turn')];

/** Opens the transcript of the stored session through the real UI. */
async function openTranscript(session: Session, segments: StoredSegment[]): Promise<void> {
  store.session = session;
  store.segments = segments;
  await history.refreshHistory();
  const view = [...document.querySelectorAll<HTMLButtonElement>('#history-list button')].find((b) => b.textContent === 'مشاهده متن')!;
  view.click();
  await vi.waitFor(() => expect(document.getElementById('history-detail')!.hidden).toBe(false));
}

describe('transcript view renders buildTranscript turns', () => {
  const segments = [
    seg('مریم احمدی', 'سلام به همه.', 0, { dur: 2_000 }),
    seg('مریم احمدی', 'جلسه رو شروع می‌کنیم.', 3_000),
    seg('John Smith', 'گزارش Q3 آماده است.', 6_000),
    seg('مریم احمدی', 'ممنون.', 9_000, { final: false }),
  ];

  it('1. renders one element per turn, matching buildTranscript', async () => {
    await openTranscript(SESSION, segments);
    expect(turns()).toHaveLength(buildTranscript(SESSION, segments).turns.length);
    expect(turns()).toHaveLength(3);
  });

  it('2. shows each turn’s speaker exactly as stored', async () => {
    await openTranscript(SESSION, segments);
    expect(turns().map((t) => t.querySelector('.turn-speaker')!.textContent)).toEqual(['مریم احمدی', 'John Smith', 'مریم احمدی']);
  });

  it('2b. speaker text is not trimmed or normalised', async () => {
    await openTranscript(SESSION, [seg(' مریم ', 'x', 0), seg('Ali', 'y', 1_000)]);
    expect(turns().map((t) => t.querySelector('.turn-speaker')!.textContent)).toEqual([' مریم ', 'Ali']);
  });

  it('3. shows the turn start time (fa-IR) with a machine-readable datetime', async () => {
    await openTranscript(SESSION, segments);
    const time = turns()[1].querySelector('time')!;
    expect(time.textContent).toBe(timeFmt.format(segments[2].startedAt));
    expect(time.dateTime).toBe(new Date(segments[2].startedAt).toISOString());
  });

  it('4. marks only partial turns with “ (ناتمام)”, outside the transcript text', async () => {
    await openTranscript(SESSION, segments);
    expect(turns().map((t) => t.querySelector('.turn-partial')?.textContent ?? null)).toEqual([null, null, PARTIAL_MARKER]);
    expect(turns()[2].querySelector('.turn-text')!.textContent).toBe('ممنون.');
  });

  it('6. keeps chronological order even when storage returns segments shuffled', async () => {
    const ordered = Array.from({ length: 12 }, (_, i) => seg(i % 3 === 0 ? 'A' : 'B', `متن ${i}`, i * 30_000));
    await openTranscript(SESSION, shuffled(ordered));
    const times = turns().map((t) => Date.parse(t.querySelector('time')!.dateTime));
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(turns().flatMap((t) => [...t.querySelectorAll('.turn-text')].map((p) => p.textContent))).toEqual(
      buildTranscript(SESSION, ordered).turns.flatMap((t) => t.paragraphs.map((p) => p.text)),
    );
  });

  it('8. rendered paragraph text is exactly the presentation-layer text (spaces, ZWNJ, repeats, punctuation kept)', async () => {
    const raw = [
      seg('A', '  فاصله‌های  اول و آخر  ', 0),
      seg('A', 'گزارش آماده آماده', 1_000),
      seg('A', 'API v2.4.0 «نقل‌قول»؟!', 2_000),
      seg('A', '👋🏽\tتب', 3_000),
    ];
    await openTranscript(SESSION, raw);
    const rendered = [...feed().querySelectorAll('.turn-text')].map((p) => p.textContent);
    expect(rendered).toEqual(buildTranscript(SESSION, raw).turns.flatMap((t) => t.paragraphs.map((p) => p.text)));
    expect(rendered.join(' ')).toBe(raw.map((s) => s.text).join(' '));
  });

  it('opening a transcript never writes to storage and does not mutate the segments', async () => {
    const before = structuredClone(segments);
    await openTranscript(SESSION, segments);
    expect(segments).toEqual(before);
    for (const fn of [repos.renameSession, repos.deleteSession, repos.upsertSegments, repos.endSession, repos.createSession]) {
      expect(fn).not.toHaveBeenCalled();
    }
  });
});

describe('empty and error states', () => {
  it('a failing session read shows an error message instead of leaving an unhandled rejection', async () => {
    store.failSession = true;
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await openTranscript(SESSION, [seg('A', 'x', 0)]);
    expect(document.getElementById('history-detail')!.hidden).toBe(false);
    expect(document.getElementById('detail-title')!.textContent).toBe('نمایش جلسه ممکن نشد');
    expect(feed().textContent).toContain('نمایش متن این جلسه ممکن نشد');
    expect(repos.getSegments).not.toHaveBeenCalled();
    err.mockRestore();
  });

  it('5. a session with no segments shows the empty state', async () => {
    await openTranscript(SESSION, []);
    expect(turns()).toHaveLength(0);
    expect(feed().textContent).toBe('این جلسه متنی ندارد.');
  });

  it('5b. a session with only blank segments shows the empty state', async () => {
    await openTranscript(SESSION, [seg('A', '   ', 0), seg('B', '', 1_000)]);
    expect(turns()).toHaveLength(0);
    expect(feed().textContent).toBe('این جلسه متنی ندارد.');
  });

  it('a failing read shows an error message and writes nothing', async () => {
    store.failSegments = true;
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await openTranscript(SESSION, [seg('A', 'x', 0)]);
    await vi.waitFor(() => expect(feed().textContent).toContain('نمایش متن این جلسه ممکن نشد'));
    expect(turns()).toHaveLength(0);
    expect(repos.deleteSession).not.toHaveBeenCalled();
    err.mockRestore();
  });
});

describe('stale render guard', () => {
  it('a slow read that finishes after the user went back does not reopen or fill the transcript', async () => {
    let release!: () => void;
    store.gate = new Promise<void>((r) => (release = r));
    store.session = SESSION;
    store.segments = [seg('A', 'دیررس', 0)];
    await history.refreshHistory();
    [...document.querySelectorAll<HTMLButtonElement>('#history-list button')].find((b) => b.textContent === 'مشاهده متن')!.click();
    await vi.waitFor(() => expect(document.getElementById('detail-title')!.textContent).toBe(SESSION.title));
    (document.getElementById('back') as HTMLButtonElement).click();
    release();
    await new Promise((r) => setTimeout(r, 0));
    expect(document.getElementById('history-detail')!.hidden).toBe(true);
    expect(turns()).toHaveLength(0);
  });
});

describe('turnView', () => {
  it('builds speaker, time, optional marker and one <p dir="auto"> per paragraph', () => {
    const t = buildTranscript(SESSION, [seg('A', 'یک', 0, { dur: 500 }), seg('A', 'دو', 30_000, { final: false })]).turns[0];
    const el = turnView(t);
    expect(el.classList.contains('partial')).toBe(true);
    expect([...el.querySelectorAll('.turn-text')].map((p) => [p.textContent, (p as HTMLElement).dir])).toEqual([['یک', 'auto'], ['دو', 'auto']]);
    expect(el.querySelector('.turn-partial')!.textContent).toBe(' (ناتمام)');
  });
  it('uses textContent only (markup in speech is shown as text, not parsed)', () => {
    const t = buildTranscript(SESSION, [seg('<b>x</b>', '<img src=x onerror=alert(1)>', 0)]).turns[0];
    const el = turnView(t);
    expect(el.querySelector('img, b')).toBeNull();
    expect(el.querySelector('.turn-text')!.textContent).toBe('<img src=x onerror=alert(1)>');
  });
});
