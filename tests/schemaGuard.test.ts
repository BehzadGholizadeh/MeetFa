import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { DB_NAME, DB_VERSION, getDB } from '../src/storage/db';

/** Stage 3 regression gate: IndexedDB v1 schema must stay exactly as at stage2.1-baseline. */
describe('IndexedDB schema guard (v1 frozen)', () => {
  it('version and stores', async () => {
    expect(DB_NAME).toBe('meetfa');
    expect(DB_VERSION).toBe(1);
    const db = await getDB();
    expect([...db.objectStoreNames].sort()).toEqual(['segments', 'sessions']);
    const tx = db.transaction(['sessions', 'segments']);
    const sessions = tx.objectStore('sessions');
    const segments = tx.objectStore('segments');
    expect(sessions.keyPath).toBe('id');
    expect(segments.keyPath).toBe('id');
    expect([...sessions.indexNames].sort()).toEqual(['byStartedAt', 'byStatus']);
    expect(sessions.index('byStartedAt').keyPath).toBe('startedAt');
    expect(sessions.index('byStatus').keyPath).toBe('status');
    expect([...segments.indexNames]).toEqual(['bySession']);
    expect(segments.index('bySession').keyPath).toBe('sessionId');
    await tx.done;
  });
});
