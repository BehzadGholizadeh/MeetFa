import type { AnyMessage, PanelRequest } from '../shared/messages';
import type { TabState } from '../shared/types';
import { STATUS_LABEL } from '../shared/status';
import { segmentView, timeFmt } from './segmentView';
import { refreshHistory } from './history';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const feed = $<HTMLElement>('feed');
const jump = $<HTMLButtonElement>('jump');
const statusEl = $<HTMLElement>('status');

let activeTabId: number | null = null;
let historyVisible = false;
const rendered = new Map<string, HTMLElement>();
const nearBottom = () => feed.scrollHeight - feed.scrollTop - feed.clientHeight < 40;

// ───────────── Tabs ─────────────
const tabs = [
  { btn: $<HTMLButtonElement>('tab-live'), view: $('view-live') },
  { btn: $<HTMLButtonElement>('tab-history'), view: $('view-history') },
];
function select(i: number): void {
  tabs.forEach((t, j) => {
    const on = i === j;
    t.btn.setAttribute('aria-selected', String(on));
    t.btn.tabIndex = on ? 0 : -1;
    t.view.hidden = !on;
  });
  historyVisible = i === 1;
  if (historyVisible) void refreshHistory();
}
tabs.forEach((t, i) => {
  t.btn.addEventListener('click', () => select(i));
  // پیمایش با کلید جهت (در RTL: چپ = بعدی)
  t.btn.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const next = (i + (e.key === 'ArrowLeft' ? 1 : -1) + tabs.length) % tabs.length;
    select(next);
    tabs[next].btn.focus();
  });
});

// ───────────── Live ─────────────
function renderStatus(st: TabState | null): void {
  const status = st?.status ?? 'idle';
  statusEl.dataset.status = status;
  $('status-label').textContent = STATUS_LABEL[status];
  const idleHint =
    'یک جلسه Google Meet را در این تب باز کنید. اگر در جلسه هستید و افزونه تازه نصب یا به‌روز شده، صفحه Meet را یک بار refresh کنید.';
  const last = st?.segments.reduce((m, x) => Math.max(m, x.updatedAt), 0) ?? 0;
  const lastText = last && status !== 'idle' ? `آخرین متن دریافتی: ${timeFmt.format(last)}` : '';
  $('status-detail').textContent =
    [st?.statusDetail ?? (status === 'idle' ? idleHint : ''), lastText].filter(Boolean).join(' · ');
  $('meet').textContent = st?.meetCode ?? '';
}

function renderFeed(st: TabState | null): void {
  const stick = nearBottom();
  const segs = st?.segments ?? [];
  const ids = new Set(segs.map((s) => s.id));
  for (const [id, el] of rendered) if (!ids.has(id)) { el.remove(); rendered.delete(id); }

  if (segs.length === 0) {
    feed.innerHTML = '<p class="empty">هنوز متنی دریافت نشده است.</p>';
    return;
  }
  feed.querySelector('.empty')?.remove();
  segs.forEach((s, i) => {
    const el = segmentView(s, rendered.get(s.id));
    rendered.set(s.id, el);
    if (feed.children[i] !== el) feed.insertBefore(el, feed.children[i] ?? null);
  });
  if (stick) feed.scrollTop = feed.scrollHeight;
  jump.hidden = nearBottom();
}

function render(st: TabState | null): void {
  renderStatus(st);
  renderFeed(st);
}

async function refresh(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  activeTabId = tab?.id ?? null;
  feed.replaceChildren();
  rendered.clear();
  if (activeTabId === null) return render(null);
  const req: PanelRequest = { type: 'GET_STATE', tabId: activeTabId };
  const st = (await chrome.runtime.sendMessage(req)) as TabState | undefined;
  render(st ?? null);
}

chrome.runtime.onMessage.addListener((msg: AnyMessage) => {
  if (msg.type === 'STATE_UPDATE' && msg.state.tabId === activeTabId) render(msg.state);
  if (msg.type === 'SESSIONS_CHANGED' && historyVisible) void refreshHistory();
});
chrome.tabs.onActivated.addListener(() => void refresh());
feed.addEventListener('scroll', () => (jump.hidden = nearBottom()));
jump.addEventListener('click', () => feed.scrollTo({ top: feed.scrollHeight, behavior: 'smooth' }));

void refresh();
