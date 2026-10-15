import type { CaptureStatus } from './types';

export const STATUS_LABEL: Record<CaptureStatus, string> = {
  idle: 'خارج از جلسه',
  ready: 'آماده',
  capturing: 'در حال دریافت',
  error: 'خطا',
  disconnected: 'قطع',
};
