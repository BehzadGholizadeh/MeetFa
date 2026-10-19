import type { Session, SessionStatus } from '../shared/types';
import { deleteSession, getSegments, getSession, listSessions, renameSession } from '../storage/repositories';
import { buildTranscript } from '../transcript/buildTranscript';
import { dateFmt, durationText, numFmt, turnView } from './segmentView';

const SESSION_STATUS: Record<SessionStatus, string> = {
  active: 'در حال ضبط',
  ended: 'پایان‌یافته',
  interrupted: 'قطع‌شده',
};

const $ = (id: string) => document.getElementById(id)!;
const list = $('history-list');
const detail = $('history-detail');
let openId: string | null = null;
/** Incremented on every detail render; a slower, older render never overwrites a newer one. */
let renderSeq = 0;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function meta(s: Session): string {
  const end = s.endedAt ?? Date.now();
  return `${dateFmt.format(s.startedAt)} · ${durationText(end - s.startedAt)} · ${numFmt.format(s.segmentCount)} بخش متن`;
}

function card(s: Session): HTMLElement {
  const c = el('article', 'session');
  c.dataset.status = s.status;

  const head = el('div', 'session-head');
  const title = el('h3', 'session-title', s.title);
  title.dir = 'auto';
  head.append(title, el('span', 'badge', SESSION_STATUS[s.status]));

  const actions = el('div', 'actions');
  const view = el('button', 'link', 'مشاهده متن');
  const rename = el('button', 'link', 'تغییر نام');
  const del = el('button', 'link danger', 'حذف');
  if (s.status === 'active') {
    del.disabled = true;
    del.title = 'جلسه در حال ضبط قابل حذف نیست';
  }
  actions.append(view, rename, del);

  view.onclick = () => void openDetail(s.id);

  rename.onclick = () => {
    const input = el('input', 'rename');
    input.value = s.title;
    input.dir = 'auto';
    input.setAttribute('aria-label', 'عنوان جدید جلسه');
    title.replaceWith(input);
    input.focus();
    input.select();
    let done = false;
    const finish = async (save: boolean) => {
      if (done) return;
      done = true;
      if (save && input.value.trim() && input.value.trim() !== s.title) await renameSession(s.id, input.value);
      await refreshHistory();
    };
    input.onkeydown = (e) => {
      if (e.key === 'Enter') void finish(true);
      if (e.key === 'Escape') void finish(false);
    };
    input.onblur = () => void finish(true);
  };

  del.onclick = () => {
    const confirmBox = el('div', 'confirm');
    const yes = el('button', 'link danger', 'بله، حذف شود');
    const no = el('button', 'link', 'انصراف');
    confirmBox.append(el('span', '', 'متن این جلسه برای همیشه حذف می‌شود.'), yes, no);
    actions.replaceWith(confirmBox);
    no.focus();
    no.onclick = () => confirmBox.replaceWith(actions);
    yes.onclick = async () => {
      if (!(await deleteSession(s.id))) {
        confirmBox.replaceChildren(el('span', 'meta', 'این جلسه دوباره در حال ضبط است و حذف نشد.'));
        setTimeout(() => void refreshHistory(), 2000);
        return;
      }
      await refreshHistory();
    };
  };

  c.append(head, el('p', 'meta', meta(s)), actions);
  return c;
}

export async function refreshHistory(): Promise<void> {
  if (openId) return void openDetail(openId);
  const sessions = await listSessions();
  list.replaceChildren(
    ...(sessions.length ? sessions.map(card) : [el('p', 'empty', 'هنوز جلسه‌ای ذخیره نشده است.')]),
  );
}

async function openDetail(id: string): Promise<void> {
  const seq = ++renderSeq;
  const t0 = performance.now();
  const s = await getSession(id);
  if (seq !== renderSeq) return;
  if (!s) {
    openId = null;
    return closeDetail();
  }
  openId = id;
  $('detail-title').textContent = s.title;
  $('detail-title').dir = 'auto';
  $('detail-meta').textContent =
    `${SESSION_STATUS[s.status]} · ${meta(s)}` + (s.status === 'active' ? ' — متن زنده را در بخش «زنده» ببینید' : '');
  const feed = $('detail-feed');
  try {
    const segs = await getSegments(id);
    if (seq !== renderSeq) return;
    // Read-only: buildTranscript is pure and nothing here writes to storage.
    const transcript = buildTranscript(s, segs);
    feed.replaceChildren(
      ...(transcript.turns.length ? transcript.turns.map(turnView) : [el('p', 'empty', 'این جلسه متنی ندارد.')]),
    );
    logRenderTiming(t0, transcript.turns.length, transcript.stats.segmentCount);
  } catch (err) {
    console.error('[MeetFa] transcript render failed', err);
    if (seq === renderSeq) feed.replaceChildren(el('p', 'empty', 'نمایش متن این جلسه ممکن نشد. داده‌های ذخیره‌شده تغییری نکرده است.'));
  }
  list.hidden = true;
  detail.hidden = false;
}

/**
 * Performance marks for the Stage 3 long-session measurement (logged as "[MeetFa] perf").
 * "dom" = turns built and inserted; "paint" = after the next two animation frames (approximate first paint).
 */
function logRenderTiming(t0: number, turns: number, segments: number): void {
  const dom = performance.now() - t0;
  performance.mark('meetfa-transcript-dom');
  const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (f: FrameRequestCallback) => setTimeout(f, 0);
  raf(() => raf(() => {
    performance.mark('meetfa-transcript-paint');
    console.debug(`[MeetFa] perf transcript: ${segments} segments, ${turns} turns, dom ${dom.toFixed(0)} ms, paint ${(performance.now() - t0).toFixed(0)} ms`);
  }));
}

function closeDetail(): void {
  openId = null;
  renderSeq++;
  detail.hidden = true;
  list.hidden = false;
  void refreshHistory();
}

$('back').addEventListener('click', closeDetail);
