import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Session, StoredSegment } from '../shared/types';

/**
 * IndexedDB در origin افزونه (chrome-extension://…)، نه meet.google.com.
 * فقط از Service Worker و Side Panel باز می‌شود — هرگز از Content Script.
 */
export interface MeetFaDB extends DBSchema {
  sessions: { key: string; value: Session; indexes: { byStartedAt: number; byStatus: string } };
  segments: { key: string; value: StoredSegment; indexes: { bySession: string } };
}

export const DB_NAME = 'meetfa';
export const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<MeetFaDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<MeetFaDB>> {
  dbPromise ??= openDB<MeetFaDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      const sessions = db.createObjectStore('sessions', { keyPath: 'id' });
      sessions.createIndex('byStartedAt', 'startedAt');
      sessions.createIndex('byStatus', 'status');
      const segments = db.createObjectStore('segments', { keyPath: 'id' });
      segments.createIndex('bySession', 'sessionId');
    },
    // نسخه جدیدتر در تب دیگری باز شد ⇒ اتصال قدیمی را ببند
    blocking() {
      dbPromise?.then((d) => d.close());
      dbPromise = null;
    },
    terminated() {
      dbPromise = null;
    },
  });
  return dbPromise;
}

/** فقط برای تست */
export function resetDBConnection(): void {
  dbPromise = null;
}
