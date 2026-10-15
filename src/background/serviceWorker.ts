import type { AnyMessage, ContentMessage, PanelUpdate } from '../shared/messages';
import type { Segment, TabState } from '../shared/types';
import { LIVE_PERSIST_MS, MAX_SEGMENTS_IN_STATE, RESUME_WINDOW_MS } from '../shared/constants';
import {
  createSession, endSession, getSession, recoverOrphans, reopenSession, upsertSegments,
} from '../storage/repositories';

/**
 * دو لایه ذخیره:
 *  - chrome.storage.session: state زنده هر تب (بقا در برابر kill شدن SW)
 *  - IndexedDB: جلسات و متن‌ها (دائمی) — منبع اصلی تاریخچه
 * همه رویدادها از یک صف سریال عبور می‌کنند ⇒ ترتیب پیام‌ها حفظ می‌شود.
 */
const states = new Map<number, TabState>();
const key = (tabId: number) => `tab:${tabId}`;

let chain: Promise<unknown> = Promise.resolve();
function enqueue(fn: () => Promise<unknown>): Promise<unknown> {
  chain = chain.then(fn).catch((e) => console.error('[MeetFa]', e));
  return chain;
}

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

// ───────────── Tab state ─────────────

async function load(tabId: number): Promise<TabState> {
  const cached = states.get(tabId);
  if (cached) return cached;
  const stored = (await chrome.storage.session.get(key(tabId)))[key(tabId)] as TabState | undefined;
  const st: TabState = stored ?? { tabId, meetCode: null, status: 'idle', segments: [] };
  states.set(tabId, st);
  return st;
}

const persistTimers = new Map<number, ReturnType<typeof setTimeout>>();
function persistState(st: TabState, immediate = false): void {
  clearTimeout(persistTimers.get(st.tabId));
  const write = () => chrome.storage.session.set({ [key(st.tabId)]: st }).catch(() => {});
  if (immediate) write();
  else persistTimers.set(st.tabId, setTimeout(write, 1000));
}

function send(msg: PanelUpdate): void {
  chrome.runtime.sendMessage(msg).catch(() => {}); // Side Panel ممکن است باز نباشد
}

// ───────────── IndexedDB writes ─────────────

/** segmentهای زنده در انتظار نوشتن، به تفکیک جلسه */
const pendingLive = new Map<string, Map<string, Segment>>();
let liveTimer: ReturnType<typeof setTimeout> | undefined;

async function flushLive(sessionId?: string): Promise<void> {
  const ids = sessionId ? [sessionId] : [...pendingLive.keys()];
  for (const id of ids) {
    const m = pendingLive.get(id);
    pendingLive.delete(id);
    if (m?.size) await upsertSegments(id, [...m.values()]);
  }
}

async function saveSegment(sessionId: string, seg: Segment): Promise<void> {
  if (seg.final) {
    pendingLive.get(sessionId)?.delete(seg.id);
    await upsertSegments(sessionId, [seg]); // نهایی ⇒ فوری
    return;
  }
  if (!pendingLive.has(sessionId)) pendingLive.set(sessionId, new Map());
  pendingLive.get(sessionId)!.set(seg.id, seg);
  liveTimer ??= setTimeout(() => {
    liveTimer = undefined;
    enqueue(() => flushLive());
  }, LIVE_PERSIST_MS);
}

// ───────────── Handlers ─────────────

async function onMeetingStarted(st: TabState, meetCode: string): Promise<void> {
  let resumed = false;
  if (st.sessionId && st.meetCode === meetCode) {
    const s = await getSession(st.sessionId);
    const recent = s && (s.status === 'active' || (s.endedAt ?? 0) > Date.now() - RESUME_WINDOW_MS);
    if (s && recent) {
      if (s.status !== 'active') await reopenSession(s.id);
      resumed = true;
    }
  }
  if (!resumed) {
    if (st.sessionId) await endSession(st.sessionId, 'ended');
    const s = await createSession(meetCode);
    st.sessionId = s.id;
    st.segments = [];
    st.startedAt = s.startedAt;
  }
  st.meetCode = meetCode;
  st.status = 'ready';
  st.statusDetail = undefined;
  send({ type: 'SESSIONS_CHANGED' });
}

async function handleContent(tabId: number, msg: ContentMessage): Promise<void> {
  const st = await load(tabId);
  let immediate = true;
  switch (msg.type) {
    case 'MEETING_STARTED':
      await onMeetingStarted(st, msg.meetCode);
      break;
    case 'MEETING_ENDED':
      if (st.sessionId) {
        await flushLive(st.sessionId);
        await endSession(st.sessionId, 'ended');
        send({ type: 'SESSIONS_CHANGED' });
      }
      st.status = 'disconnected';
      st.statusDetail = 'از جلسه خارج شدید — متن ذخیره شد';
      break;
    case 'STATUS':
      st.status = msg.status;
      st.statusDetail = msg.detail;
      break;
    case 'SEGMENT_UPSERT': {
      const i = st.segments.findIndex((s) => s.id === msg.segment.id);
      if (i >= 0) st.segments[i] = msg.segment;
      else st.segments.push(msg.segment);
      if (st.segments.length > MAX_SEGMENTS_IN_STATE) st.segments.splice(0, st.segments.length - MAX_SEGMENTS_IN_STATE);
      if (st.sessionId) await saveSegment(st.sessionId, msg.segment);
      immediate = msg.segment.final;
      break;
    }
  }
  persistState(st, immediate);
  send({ type: 'STATE_UPDATE', state: st });
}

/** قطع ناگهانی ارتباط تب با جلسه (reload، ناوبری، بستن تب) */
async function interruptTab(tabId: number, detail: string, forget: boolean): Promise<void> {
  const st = states.get(tabId) ?? ((await chrome.storage.session.get(key(tabId)))[key(tabId)] as TabState | undefined);
  if (!st) return;
  if (st.sessionId) {
    await flushLive(st.sessionId);
    const s = await endSession(st.sessionId, 'interrupted');
    if (s) send({ type: 'SESSIONS_CHANGED' });
  }
  if (forget) {
    states.delete(tabId);
    await chrome.storage.session.remove(key(tabId)).catch(() => {});
    return;
  }
  if (st.status === 'idle' || st.status === 'disconnected') return;
  st.status = 'disconnected';
  st.statusDetail = detail;
  states.set(tabId, st);
  persistState(st, true);
  send({ type: 'STATE_UPDATE', state: st });
}

// ───────────── Wiring ─────────────

chrome.runtime.onMessage.addListener((msg: AnyMessage, sender, sendResponse) => {
  if (msg.type === 'GET_STATE') {
    load(msg.tabId).then(sendResponse);
    return true;
  }
  const tabId = sender.tab?.id;
  if (tabId === undefined) return false;
  if (msg.type === 'MEETING_STARTED' || msg.type === 'MEETING_ENDED' || msg.type === 'STATUS' || msg.type === 'SEGMENT_UPSERT') {
    enqueue(() => handleContent(tabId, msg));
  }
  return false;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  enqueue(() => interruptTab(tabId, '', true));
});

chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === 'loading') enqueue(() => interruptTab(tabId, 'صفحه دوباره بارگذاری شد', false));
});

/** بازیابی پس از کرش / بستن مرورگر: هر بار که SW بالا می‌آید */
enqueue(async () => {
  const all = await chrome.storage.session.get(null);
  const live = new Set(
    Object.values(all)
      .map((v) => (v as TabState)?.sessionId)
      .filter((x): x is string => !!x),
  );
  if ((await recoverOrphans(live)) > 0) send({ type: 'SESSIONS_CHANGED' });
});
