/** وضعیت دریافت برای یک تب */
export type CaptureStatus =
  | 'idle'          // در جلسه Meet نیستیم
  | 'ready'         // آماده: داخل جلسه، منتظر زیرنویس
  | 'capturing'     // در حال دریافت
  | 'error'         // خطا (مثلاً ساختار DOM عوض شده)
  | 'disconnected'; // قطع: خروج از جلسه / ارتباط از دست رفت

export interface Segment {
  id: string;
  speaker: string;
  text: string;
  startedAt: number;
  updatedAt: number;
  final: boolean;
}

export interface TabState {
  tabId: number;
  meetCode: string | null;
  status: CaptureStatus;
  statusDetail?: string;
  startedAt?: number;
  /** جلسه ذخیره‌شده متناظر در IndexedDB */
  sessionId?: string;
  segments: Segment[];
}

/** وضعیت جلسه ذخیره‌شده */
export type SessionStatus =
  | 'active'       // در حال ضبط
  | 'ended'        // پایان عادی (خروج از جلسه)
  | 'interrupted'; // قطع ناگهانی (بستن تب، کرش، بستن مرورگر)

export interface Session {
  id: string;
  title: string;
  meetCode: string;
  startedAt: number;
  endedAt?: number;
  status: SessionStatus;
  language?: string;
  /** شمارنده برای نمایش سریع در لیست (بدون خواندن segmentها) */
  segmentCount: number;
}

export interface StoredSegment extends Segment {
  sessionId: string;
}
