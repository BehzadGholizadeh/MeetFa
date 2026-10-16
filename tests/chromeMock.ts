/** شبیه‌ساز حداقلی API کروم برای تست Service Worker (بدون مرورگر) */
type Listener = (...args: any[]) => any;

export function installChromeMock() {
  const session: Record<string, unknown> = {};
  const listeners = { message: [] as Listener[], removed: [] as Listener[], updated: [] as Listener[] };
  const sent: any[] = [];
  const clone = <T>(v: T): T => structuredClone(v);

  (globalThis as any).chrome = {
    sidePanel: { setPanelBehavior: () => Promise.resolve() },
    runtime: {
      onMessage: { addListener: (f: Listener) => listeners.message.push(f) },
      sendMessage: (m: unknown) => (sent.push(clone(m)), Promise.resolve()),
    },
    storage: {
      session: {
        get: async (k: string | null) =>
          k === null ? clone(session) : k in session ? { [k]: clone(session[k]) } : {},
        set: async (o: Record<string, unknown>) => void Object.assign(session, clone(o)),
        remove: async (k: string) => void delete session[k],
      },
    },
    tabs: {
      onRemoved: { addListener: (f: Listener) => listeners.removed.push(f) },
      onUpdated: { addListener: (f: Listener) => listeners.updated.push(f) },
    },
  };

  return {
    session,
    sent,
    /** پیام از Content Script تب tabId */
    fromTab: (tabId: number, msg: unknown) => listeners.message.forEach((f) => f(msg, { tab: { id: tabId } }, () => {})),
    closeTab: (tabId: number) => listeners.removed.forEach((f) => f(tabId, {})),
    reloadTab: (tabId: number) => listeners.updated.forEach((f) => f(tabId, { status: 'loading' })),
  };
}

/** صبر تا خالی شدن صف سریال SW و تراکنش‌های IndexedDB */
export const settle = (ms = 60) => new Promise((r) => setTimeout(r, ms));
