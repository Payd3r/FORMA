import { apiFetch } from './api';
import { apriDB, type PendingOp, type Sessione, type Setting, type Tombstone } from './idb';
export type SyncState = { status: 'idle' | 'syncing' | 'offline' | 'error'; pending: number; lastSync?: string };
let state: SyncState = { status: 'idle', pending: 0 };
const listeners = new Set<() => void>();
export const subscribeSync = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export const getSyncState = () => state;
function update(patch: Partial<SyncState>) { state = { ...state, ...patch }; listeners.forEach(fn => fn()); }
let localGeneration = 0;
export async function refreshSyncPending() {
  const generation = ++localGeneration;
  update({ pending: Math.max(1, state.pending) });
  const pending = await (await apriDB()).count('outbox');
  if (generation === localGeneration) update({ pending });
}
let running: Promise<{ applied: number }> | undefined;
export function reconcileFromServer() {
  if (running) return running;
  running = synchronize().finally(() => { running = undefined; if (state.status === 'idle' && state.pending > 0) setTimeout(() => void reconcileFromServer(), 0); }); return running;
}
async function synchronize() {
  const db = await apriDB();
  update({ pending: await db.count('outbox') });
  if (!navigator.onLine) { update({ status: 'offline' }); return { applied: 0 }; }
  update({ status: 'syncing' });
  let applied = 0;
  try {
    // Import the old durable queue once, without replacing newer local edits.
    const raw = localStorage.getItem('fitness-sync-queue');
    if (raw) {
      let queue: { type: 'upsert' | 'delete'; sessionId: string; payload?: Sessione; timestamp: string }[] = [];
      try { const parsed = JSON.parse(raw); if (Array.isArray(parsed)) queue = parsed; } catch { localStorage.setItem('fitness-sync-queue-recovery', raw); }
      const tx = db.transaction(['outbox', 'sessioni', 'deleted'], 'readwrite');
      const latestById = new Map(queue.filter(op => op && typeof op.sessionId === 'string' && ['upsert', 'delete'].includes(op.type)).map(op => [op.sessionId, op]));
      for (const old of latestById.values()) {
        const key = `session:${old.sessionId}`;
        if (await tx.objectStore('outbox').get(key)) continue;
        const local: Sessione | undefined = await tx.objectStore('sessioni').get(old.sessionId);
        const payload = old.type === 'delete' ? { sessionId: old.sessionId, updatedAt: old.timestamp } : local ?? old.payload;
        if (payload) {
          await tx.objectStore('outbox').put({ key, type: old.type, version: payload.updatedAt, payload });
          if (old.type === 'delete') { await tx.objectStore('sessioni').delete(old.sessionId); await tx.objectStore('deleted').put(payload); }
        }
      }
      await tx.done; localStorage.removeItem('fitness-sync-queue');
    }
    // Local sessions from the previous app must also survive migration.
    if (!await db.get('settings', 'migration-v3')) {
      const tx = db.transaction(['sessioni', 'outbox', 'settings'], 'readwrite');
      for (const session of await tx.objectStore('sessioni').getAll() as Sessione[]) {
        const key = `session:${session.sessionId}`;
        if (!await tx.objectStore('outbox').get(key)) await tx.objectStore('outbox').put({ key, type: 'upsert', version: session.updatedAt, payload: session });
      }
      await tx.objectStore('settings').put({ key: 'migration-v3', value: true, updatedAt: new Date().toISOString() }); await tx.done;
    }
    const queue: PendingOp[] = await db.getAll('outbox');
    for (const op of queue) {
      if (op.type === 'setting') {
        const payload = op.payload as Setting;
        await apiFetch(`/api/settings/${encodeURIComponent(payload.key)}`, { method: 'PUT', json: payload });
      } else {
        const payload = op.payload as Sessione | Tombstone;
        await apiFetch(`/api/sessions/${encodeURIComponent(payload.sessionId)}`, { method: op.type === 'delete' ? 'DELETE' : 'PUT', json: payload });
      }
      // A change made during the request must remain queued.
      const tx = db.transaction('outbox', 'readwrite');
      const latest = await tx.store.get(op.key) as PendingOp | undefined;
      if (latest?.version === op.version) await tx.store.delete(op.key);
      await tx.done;
    }
    const remote = await apiFetch<{ sessions: Sessione[]; deleted: Tombstone[]; settings: Setting[] }>('/api/state');
    const tx = db.transaction(['sessioni', 'outbox', 'settings', 'deleted'], 'readwrite');
    for (const deleted of remote.deleted) {
      if (await tx.objectStore('outbox').get(`session:${deleted.sessionId}`)) continue;
      const prior: Tombstone | undefined = await tx.objectStore('deleted').get(deleted.sessionId);
      if (prior && prior.updatedAt >= deleted.updatedAt) continue;
      const local: Sessione | undefined = await tx.objectStore('sessioni').get(deleted.sessionId);
      if (!local || deleted.updatedAt >= local.updatedAt) { await tx.objectStore('sessioni').delete(deleted.sessionId); await tx.objectStore('deleted').put(deleted); applied++; }
    }
    for (const session of remote.sessions) {
      if (await tx.objectStore('outbox').get(`session:${session.sessionId}`)) continue;
      const deleted: Tombstone | undefined = await tx.objectStore('deleted').get(session.sessionId);
      const local: Sessione | undefined = await tx.objectStore('sessioni').get(session.sessionId);
      if ((!deleted || deleted.updatedAt < session.updatedAt) && (!local || session.updatedAt > local.updatedAt)) { await tx.objectStore('sessioni').put(session); applied++; }
    }
    for (const setting of remote.settings) {
      if (await tx.objectStore('outbox').get(`setting:${setting.key}`)) continue;
      const local: Setting | undefined = await tx.objectStore('settings').get(setting.key);
      if (!local || setting.updatedAt > local.updatedAt) { await tx.objectStore('settings').put(setting); applied++; }
    }
    await tx.done;
    update({ status: 'idle', pending: await db.count('outbox'), lastSync: new Date().toISOString() });
    if (applied) window.dispatchEvent(new Event('fitness-remote-change'));
  } catch { update({ status: navigator.onLine ? 'error' : 'offline', pending: await db.count('outbox') }); }
  return { applied };
}
export const flushQueue = reconcileFromServer;
