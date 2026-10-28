export type RestTimer = { sessionId: string; exerciseId: string; setIndex: number; startedAt: number; deadline: number; seconds: number; source: string; sampleCount: number; reasons: string[] };
const KEY = 'forma-rest-timer-v1';
export function readRestTimer(): RestTimer | null {
  try { const value = JSON.parse(localStorage.getItem(KEY) ?? 'null') as RestTimer | null; return value && typeof value.sessionId === 'string' && Number.isFinite(value.deadline) && Number.isFinite(value.startedAt) && value.seconds > 0 ? value : null; } catch { return null; }
}
export function writeRestTimer(value: RestTimer | null) { if (value) localStorage.setItem(KEY, JSON.stringify(value)); else localStorage.removeItem(KEY); }
