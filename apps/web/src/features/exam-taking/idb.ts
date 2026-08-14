/**
 * Best-effort IndexedDB backup of answers, keyed by `${attemptId}:${questionPublicId}`.
 * A crashed tab resumes with zero lost answers. All operations swallow errors — the DB and Redis
 * remain the source of truth; this is only a local safety net.
 */
const DB_NAME = 'exam-backup';
const STORE = 'answers';

export interface BackupAnswer {
  selectedOptionId: string | null;
  writtenText: string | null;
  updatedAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const keyFor = (attemptId: string, q: string) => `${attemptId}::${q}`;

export async function idbPut(attemptId: string, q: string, value: BackupAnswer): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, keyFor(attemptId, q));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* best-effort */
  }
}

export async function idbGetAll(attemptId: string): Promise<Record<string, BackupAnswer>> {
  try {
    const db = await openDb();
    const prefix = `${attemptId}::`;
    const out = await new Promise<Record<string, BackupAnswer>>((resolve) => {
      const result: Record<string, BackupAnswer> = {};
      const cursor = db.transaction(STORE, 'readonly').objectStore(STORE).openCursor();
      cursor.onsuccess = () => {
        const c = cursor.result;
        if (!c) return resolve(result);
        const k = String(c.key);
        if (k.startsWith(prefix)) result[k.slice(prefix.length)] = c.value as BackupAnswer;
        c.continue();
      };
      cursor.onerror = () => resolve(result);
    });
    db.close();
    return out;
  } catch {
    return {};
  }
}
