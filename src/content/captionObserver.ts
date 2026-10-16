import type { CaptureStatus, Segment } from '../shared/types';
import { FINALIZE_IDLE_MS, HEALTH_TIMEOUT_MS, STALL_SCANS, UPSERT_THROTTLE_MS } from '../shared/constants';
import { findCaptionRegion, isCaptionsButtonOn } from './selectors';
import { parseCaptionRegion, regionHasText } from './captionParser';
import { continuationAfter, SegmentTracker } from './segmentTracker';

export interface ObserverCallbacks {
  onSegments(segs: Segment[]): void;
  onStatus(status: CaptureStatus, detail?: string): void;
}

/**
 * پیدا کردن ناحیه زیرنویس، observe کردن آن، و Health Check.
 * Observer فقط روی خود ناحیه است (نه کل body) تا سربار کم باشد.
 */
export class CaptionObserver {
  private region: Element | null = null;
  private mo: MutationObserver | null = null;
  private pollTimer: number | undefined;
  private scanScheduled = false;
  private lastStatus = '';
  private captionsOnSince: number | null = null;
  private unparsedSince: number | null = null;
  private pending = new Map<string, Segment>();
  private flushTimer: number | undefined;
  /** آخرین زمانی که متن تازه واقعاً ثبت شد */
  private lastChangeAt = 0;
  /** متن کل ناحیه در اسکن قبلی (برای تشخیص «Meet متن تازه نشان داد») */
  private lastRegionText = '';
  /** تعداد اسکن‌های پیاپی که Meet متن تازه نشان داده ولی چیزی ثبت نشده */
  private stallScans = 0;

  constructor(
    private cb: ObserverCallbacks,
    private tracker: SegmentTracker = new SegmentTracker(),
  ) {}

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
    const r = findCaptionRegion();
    // ناحیه فعال عوض شده ولی قدیمی هنوز در DOM است (پنهان / بی‌برچسب)
    if (this.region && r && r !== this.region) this.detach();
    if (!this.region && r) this.attach(r);
    this.queue(this.tracker.tick());
    this.health();
  }

  private attach(region: Element): void {
    console.debug('[MeetFa] caption region attached');
    this.region = region;
    this.lastRegionText = '';
    this.stallScans = 0;
    this.mo = new MutationObserver(() => this.scheduleScan());
    this.mo.observe(region, { childList: true, subtree: true, characterData: true });
    this.scheduleScan();
  }

  private detach(): void {
    if (this.region) console.debug('[MeetFa] caption region detached');
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
      const changes = this.tracker.update(blocks);
      this.queue(changes);
      const regionText = blocks.map((b) => b.text).join('\n');
      const meetShowedNewText = continuationAfter(this.lastRegionText, regionText) !== '';
      this.lastRegionText = regionText;
      if (changes.length > 0) {
        this.lastChangeAt = Date.now();
        this.stallScans = 0;
        this.setStatus('capturing');
      } else if (meetShowedNewText && ++this.stallScans >= STALL_SCANS) {
        // شاهد مستقیم، نه گذشت زمان: Meet متن تازه نشان می‌دهد و MeetFa ثبتش نمی‌کند
        this.setStatus('error', 'متن زیرنویس Meet تغییر می‌کند ولی در MeetFa ثبت نمی‌شود');
      }
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
    } else if (this.stallScans >= STALL_SCANS) {
      // خطای ثبت‌نشدن تا وقتی متن دوباره ثبت شود باقی می‌ماند
    } else if (!this.lastStatus.startsWith('capturing') || now - this.lastChangeAt >= FINALIZE_IDLE_MS) {
      // سکوت خطا نیست: فقط «آماده» نمایش داده می‌شود
      this.setStatus('ready', 'زیرنویس روشن است؛ منتظر صحبت…');
    }
  }

  private setStatus(status: CaptureStatus, detail?: string): void {
    const key = `${status}|${detail ?? ''}`;
    if (key === this.lastStatus) return;
    this.lastStatus = key;
    console.debug('[MeetFa] status', status, detail ?? '');
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
