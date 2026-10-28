import { openDB } from 'idb';
import type { DayTemplate } from './useTemplate';
import { localDate } from './date';

export type StatoSessione = 'in_progress' | 'completed';
export type SetEseguito = { setIndex: number; weight: number; reps: number; completed?: boolean; completedAt?: string; restSeconds?: number; kind?: 'normal' | 'drop'; note?: string; weightString?: string; repsString?: string; weightPrefilled?: boolean; repsPrefilled?: boolean };
export type VoceAllenamento = { exerciseId: string; performedSets: SetEseguito[] };
export type Sessione = {
  schemaVersion: number; userId: string; sessionId: string; date: string; templateId: string; dayId: string;
  status: StatoSessione; entries: VoceAllenamento[]; exerciseOrder?: string[]; sessionNotes?: string;
  daySnapshot?: DayTemplate; templateName?: string; createdAt: string; updatedAt: string;
};
export type Setting = { key: string; value: unknown; updatedAt: string };
export type PendingOp = { key: string; version: string; type: 'upsert' | 'delete' | 'setting'; payload: Sessione | Setting | { sessionId: string; updatedAt: string } };
export type Tombstone = { sessionId: string; updatedAt: string };
type AvvioSessioneInput = { templateId: string; dayId: string; date?: string; sessionNotes?: string; exerciseOrder?: string[]; daySnapshot?: DayTemplate; templateName?: string; entries?: VoceAllenamento[] };
export type AvvioSessioneOpzioni = { bloccaPrecedente?: boolean };
export type AvvioSessioneEsito = { stato: 'avviata'; sessione: Sessione; sessioneBloccata?: Sessione } | { stato: 'bloccata'; sessioneAttiva: Sessione };
let database: ReturnType<typeof openDB> | undefined;
export function apriDB() {
  return database ??= openDB('fitness', 3, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('sessioni')) {
        const store = db.createObjectStore('sessioni', { keyPath: 'sessionId' });
        store.createIndex('by-status', 'status'); store.createIndex('by-template', 'templateId'); store.createIndex('by-date', 'date');
      }
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('deleted')) db.createObjectStore('deleted', { keyPath: 'sessionId' });
    }, blocking() { database?.then(db => db.close()); database = undefined; }
  });
}
let lastTimestamp = 0;
export function timestamp(after?: string) { lastTimestamp = Math.max(Date.now(), lastTimestamp + 1, after && Number.isFinite(Date.parse(after)) ? Date.parse(after) + 1 : 0); return new Date(lastTimestamp).toISOString(); }
export const confirmedSets = (session: Sessione, entry: VoceAllenamento) => entry.performedSets.filter(s => s.completed === true || (s.completed === undefined && session.status === 'completed' && s.reps > 0));
export async function prendiSessioni(): Promise<Sessione[]> { const db = await apriDB(); return (await db.getAll('sessioni')).sort((a: Sessione, b: Sessione) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)); }
export async function prendiSessione(id: string): Promise<Sessione | undefined> { return (await apriDB()).get('sessioni', id); }
export async function prendiSessioneAttiva(): Promise<Sessione | undefined> { return (await prendiSessioni()).find(s => s.status === 'in_progress'); }
export async function prendiUltimaSessioneCompletata(dayId: string) { return (await prendiSessioni()).find(s => s.status === 'completed' && s.dayId === dayId); }
export async function salvaSessione(session: Sessione): Promise<Sessione> {
  const db = await apriDB();
  const tx = db.transaction(['sessioni', 'outbox'], 'readwrite');
  const payload = { ...session, updatedAt: timestamp(session.updatedAt) };
  await tx.objectStore('sessioni').put(payload);
  await tx.objectStore('outbox').put({ key: `session:${session.sessionId}`, version: payload.updatedAt, type: 'upsert', payload } satisfies PendingOp);
  await tx.done; window.dispatchEvent(new Event('fitness-local-change')); return payload;
}
export async function salvaSessioneRemota(session: Sessione) { await (await apriDB()).put('sessioni', session); }
export async function salvaSessioni(sessions: Sessione[]) { for (const session of sessions) await salvaSessione(session); return sessions.length; }
export async function avviaSessione(input: AvvioSessioneInput, options: AvvioSessioneOpzioni = {}): Promise<AvvioSessioneEsito> {
  const active = await prendiSessioneAttiva();
  if (active && !options.bloccaPrecedente) return { stato: 'bloccata', sessioneAttiva: active };
  let sessioneBloccata: Sessione | undefined;
  if (active) sessioneBloccata = await salvaSessione({ ...active, status: 'completed' });
  const now = timestamp(); const date = input.date?.slice(0, 10) ?? localDate();
  const session = await salvaSessione({ schemaVersion: 2, userId: 'local-user', sessionId: crypto.randomUUID(), date, templateId: input.templateId, dayId: input.dayId, status: 'in_progress', entries: input.entries ?? [], exerciseOrder: input.exerciseOrder ?? [], daySnapshot: input.daySnapshot, templateName: input.templateName, sessionNotes: input.sessionNotes, createdAt: now, updatedAt: now });
  return { stato: 'avviata', sessione: session, sessioneBloccata };
}
export async function aggiornaSessione(id: string, patch: Partial<Omit<Sessione, 'sessionId' | 'createdAt' | 'userId'>>) {
  const db = await apriDB(); const tx = db.transaction(['sessioni', 'outbox'], 'readwrite');
  const existing: Sessione | undefined = await tx.objectStore('sessioni').get(id);
  if (!existing) { await tx.done; return undefined; }
  const payload = { ...existing, ...patch, updatedAt: timestamp(existing.updatedAt) };
  await tx.objectStore('sessioni').put(payload);
  await tx.objectStore('outbox').put({ key: `session:${id}`, version: payload.updatedAt, type: 'upsert', payload } satisfies PendingOp);
  await tx.done; window.dispatchEvent(new Event('fitness-local-change')); return payload;
}
export function completaSessione(id: string, patch: Partial<Omit<Sessione, 'sessionId' | 'createdAt' | 'userId'>> = {}) { return aggiornaSessione(id, { ...patch, status: 'completed' }); }
export async function eliminaSessione(id: string) {
  const db = await apriDB(); const tx = db.transaction(['sessioni', 'outbox', 'deleted'], 'readwrite');
  const existing: Sessione | undefined = await tx.objectStore('sessioni').get(id);
  const payload = { sessionId: id, updatedAt: timestamp(existing?.updatedAt) };
  await tx.objectStore('sessioni').delete(id); await tx.objectStore('deleted').put(payload);
  await tx.objectStore('outbox').put({ key: `session:${id}`, version: payload.updatedAt, type: 'delete', payload } satisfies PendingOp);
  await tx.done; window.dispatchEvent(new Event('fitness-local-change'));
}
export async function readSetting<T>(key: string): Promise<T | undefined> { return ((await (await apriDB()).get('settings', key)) as Setting | undefined)?.value as T | undefined; }
export async function writeSetting(key: string, value: unknown) {
  const db = await apriDB(); const tx = db.transaction(['settings', 'outbox'], 'readwrite');
  const previous: Setting | undefined = await tx.objectStore('settings').get(key);
  const payload: Setting = { key, value, updatedAt: timestamp(previous?.updatedAt) };
  await tx.objectStore('settings').put(payload);
  await tx.objectStore('outbox').put({ key: `setting:${key}`, version: payload.updatedAt, type: 'setting', payload } satisfies PendingOp);
  await tx.done; window.dispatchEvent(new Event('fitness-local-change'));
}
export async function getLogs() { return { schemaVersion: 2, userId: 'local-user', sessions: await prendiSessioni() }; }
