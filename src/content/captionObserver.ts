import type { CaptureStatus, Segment } from '../shared/types';
import { HEALTH_TIMEOUT_MS, UPSERT_THROTTLE_MS } from '../shared/constants';
import { findCaptionRegion, isCaptionsButtonOn } from './selectors';
import { parseCaptionRegion, regionHasText } from './captionParser';
import { SegmentTracker } from './segmentTracker';

export interface ObserverCallbacks {
  onSegments(segs: Segment[]): void;
  onStatus(status: CaptureStatus, detail?: string): void;
}

/**
 * پیدا کردن ناحیه زیرنویس، observe کردن آن، و Health Check.
 * Observer فقط روی خود ناحیه است (نه کل body) تا سربار کم باشد.
 */
export class CaptionObserver {
  private tracker = new SegmentTracker();
  private region: Element | null = null;
  private mo: MutationObserver | null = null;
  private pollTimer: number | undefined;
  private scanScheduled = false;
  private lastStatus = '';
  private captionsOnSince: number | null = null;
  private unparsedSince: number | null = null;
  private pending = new Map<string, Segment>();
  private flushTimer: number | undefined;

  constructor(private cb: ObserverCallbacks) {}

  start(): void {
    this.setStatus('ready', 'زیرنویس (CC) را در Meet روشن کنید');
    this.pollTimer = window.setInterval(() => this.poll(), 1000);
    this.poll();
  }

  stop(): void {
    window.clearInterval(this.pollTimer);
    this.detach();
    this.queue(this.tracker.flushAll());
    this.flush();
  }

  private poll(): void {
    // ناحیه ممکن است با روشن/خاموش کردن CC یا re-render عوض شود
    if (this.region && !this.region.isConnected) this.detach();
    if (!this.region) {
      const r = findCaptionRegion();
      if (r) this.attach(r);
    }
    this.queue(this.tracker.tick());
    this.health();
  }

  private attach(region: Element): void {
    this.region = region;
    this.mo = new MutationObserver(() => this.scheduleScan());
    this.mo.observe(region, { childList: true, subtree: true, characterData: true });
    this.scheduleScan();
  }

  private detach(): void {
    this.mo?.disconnect();
    this.mo = null;
    this.region = null;
    this.queue(this.tracker.flushAll());
  }

  private scheduleScan(): void {
    if (this.scanScheduled) return;
    this.scanScheduled = true;
    window.setTimeout(() => {
      this.scanScheduled = false;
      this.scan();
    }, 150);
  }

  private scan(): void {
    if (!this.region) return;
    const blocks = parseCaptionRegion(this.region);
    if (blocks.length > 0) {
      this.unparsedSince = null;
      this.queue(this.tracker.update(blocks));
      this.setStatus('capturing');
    } else if (regionHasText(this.region)) {
      this.unparsedSince ??= Date.now();
    }
  }

  private health(): void {
    const now = Date.now();
    const ccOn = isCaptionsButtonOn();
    this.captionsOnSince = ccOn ? (this.captionsOnSince ?? now) : null;

    if (this.unparsedSince && now - this.unparsedSince > HEALTH_TIMEOUT_MS) {
      return this.setStatus('error', 'متن زیرنویس دیده می‌شود ولی قابل خواندن نیست؛ احتمالاً ساختار Meet تغییر کرده');
    }
    if (!this.region && this.captionsOnSince && now - this.captionsOnSince > HEALTH_TIMEOUT_MS) {
      return this.setStatus('error', 'زیرنویس روشن است ولی ناحیه آن پیدا نشد؛ احتمالاً ساختار Meet تغییر کرده');
    }
    if (!this.region) {
      this.setStatus('ready', 'زیرنویس (CC) را در Meet روشن کنید');
    } else if (!this.lastStatus.startsWith('capturing')) {
      this.setStatus('ready', 'زیرنویس روشن است؛ منتظر صحبت…');
    }
  }

  private setStatus(status: CaptureStatus, detail?: string): void {
    const key = `${status}|${detail ?? ''}`;
    if (key === this.lastStatus) return;
    this.lastStatus = key;
    this.cb.onStatus(status, detail);
  }

  /** تجمیع آپدیت‌ها: هر segment حداکثر هر UPSERT_THROTTLE_MS یک بار ارسال می‌شود */
  private queue(segs: Segment[]): void {
    if (segs.length === 0) return;
    segs.forEach((s) => this.pending.set(s.id, s));
    if (segs.some((s) => s.final)) return this.flush();
    if (this.flushTimer === undefined) {
      this.flushTimer = window.setTimeout(() => this.flush(), UPSERT_THROTTLE_MS);
    }
  }

  private flush(): void {
    window.clearTimeout(this.flushTimer);
    this.flushTimer = undefined;
    if (this.pending.size === 0) return;
    const list = [...this.pending.values()];
    this.pending.clear();
    this.cb.onSegments(list);
  }
}
