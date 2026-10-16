/** شبیه‌ساز حداقلی API کروم برای تست Service Worker (بدون مرورگر) */
type Listener = (...args: any[]) => any;

export interface ChromeMockOptions {
  /** تأخیر مصنوعی (ms) برای chrome.storage.session.get — شبیه‌سازی CPU کند / رقابت worker */
  storageDelayMs?: number;
}

export function installChromeMock(opts: ChromeMockOptions = {}) {
  const session: Record<string, unknown> = {};
  const listeners = { message: [] as Listener[], removed: [] as Listener[], updated: [] as Listener[] };
  const sent: any[] = [];
  const clone = <T>(v: T): T => structuredClone(v);
  const delay = () =>
    opts.storageDelayMs ? new Promise<void>((r) => setTimeout(r, opts.storageDelayMs)) : Promise.resolve();

  (globalThis as any).chrome = {
    sidePanel: { setPanelBehavior: () => Promise.resolve() },
    runtime: {
      onMessage: { addListener: (f: Listener) => listeners.message.push(f) },
      sendMessage: (m: unknown) => (sent.push(clone(m)), Promise.resolve()),
    },
    storage: {
      session: {
        get: async (k: string | null) => {
          await delay();
          return k === null ? clone(session) : k in session ? { [k]: clone(session[k]) } : {};
        },
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
    /** SW قبلی مرده است: listenerهایش نباید رویداد بگیرند (شبیه‌سازی kill/restart) */
    resetListeners: () => {
      listeners.message.length = 0;
      listeners.removed.length = 0;
      listeners.updated.length = 0;
    },
    listenerCount: () => listeners.message.length,
  };
}
