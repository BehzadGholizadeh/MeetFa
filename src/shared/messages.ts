import type { CaptureStatus, Segment, TabState } from './types';

/** Content Script → Service Worker */
export type ContentMessage =
  | { type: 'MEETING_STARTED'; meetCode: string }
  | { type: 'MEETING_ENDED' }
  | { type: 'STATUS'; status: CaptureStatus; detail?: string }
  | { type: 'SEGMENT_UPSERT'; segment: Segment };

/** Side Panel → Service Worker */
export type PanelRequest = { type: 'GET_STATE'; tabId: number };

/** Service Worker → Side Panel */
export type PanelUpdate =
  | { type: 'STATE_UPDATE'; state: TabState }
  /** لیست جلسات تغییر کرد (ایجاد / پایان / قطع) */
  | { type: 'SESSIONS_CHANGED' };

export type AnyMessage = ContentMessage | PanelRequest | PanelUpdate;
