import { Router } from 'express';
import { getDb, parseSessionRow, serializeSession, type SessionRow } from '../db.js';
import type { ApiSessionPayload, Sessione } from '../types.js';
const router = Router();
const validTimestamp = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
function valid(payload: ApiSessionPayload) {
  return !!payload && Number.isFinite(payload.schemaVersion) && typeof payload.sessionId === 'string' && typeof payload.templateId === 'string' && typeof payload.dayId === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(payload.date) && ['in_progress', 'completed'].includes(payload.status) && validTimestamp(payload.createdAt) && validTimestamp(payload.updatedAt) && Array.isArray(payload.entries) && payload.entries.every(e => typeof e.exerciseId === 'string' && Array.isArray(e.performedSets) && e.performedSets.every(s => Number.isFinite(s.weight) && s.weight >= 0 && Number.isFinite(s.reps) && s.reps >= 0));
}
function upsert(payload: ApiSessionPayload): boolean {
  const db = getDb();
  const deleted = db.prepare('SELECT updatedAt FROM deleted_sessions WHERE sessionId = ?').get(payload.sessionId) as { updatedAt: string } | undefined;
  const existing = db.prepare('SELECT updatedAt FROM sessions WHERE sessionId = ?').get(payload.sessionId) as { updatedAt: string } | undefined;
  if ((deleted && deleted.updatedAt >= payload.updatedAt) || (existing && existing.updatedAt >= payload.updatedAt)) return false;
  const row = serializeSession({ ...payload, userId: 'local-user' });
  db.prepare(`INSERT OR REPLACE INTO sessions (sessionId,userId,date,templateId,dayId,status,entries,exerciseOrder,sessionNotes,createdAt,updatedAt,schemaVersion,daySnapshot,templateName)
    VALUES (@sessionId,@userId,@date,@templateId,@dayId,@status,@entries,@exerciseOrder,@sessionNotes,@createdAt,@updatedAt,@schemaVersion,@daySnapshot,@templateName)`).run(row);
  db.prepare('DELETE FROM deleted_sessions WHERE sessionId = ?').run(payload.sessionId); return true;
}
router.get('/state', (_req, res) => {
  const db = getDb();
  res.json({ sessions: (db.prepare('SELECT * FROM sessions ORDER BY date DESC').all() as SessionRow[]).map(parseSessionRow), deleted: db.prepare('SELECT * FROM deleted_sessions').all(), settings: (db.prepare('SELECT * FROM settings').all() as { key: string; value: string; updatedAt: string }[]).map(s => ({ ...s, value: JSON.parse(s.value) })) });
});
router.get('/sessions', (_req, res) => { res.json((getDb().prepare('SELECT * FROM sessions ORDER BY date DESC').all() as SessionRow[]).map(parseSessionRow)); });
router.get('/sessions/:sessionId', (req, res) => {
  const row = getDb().prepare('SELECT * FROM sessions WHERE sessionId = ?').get(req.params.sessionId) as SessionRow | undefined;
  if (!row) { res.status(404).json({ error: 'Sessione non trovata' }); return; } res.json(parseSessionRow(row));
});
router.put('/sessions/:sessionId', (req, res) => {
  const payload = { ...req.body, sessionId: req.params.sessionId } as ApiSessionPayload;
  if (!valid(payload)) { res.status(400).json({ error: 'Sessione non valida' }); return; }
  const applied = getDb().transaction(() => upsert(payload))(); res.json({ applied });
});
router.post('/sessions', (req, res) => {
  if (!valid(req.body)) { res.status(400).json({ error: 'Sessione non valida' }); return; }
  const applied = getDb().transaction(() => upsert(req.body))(); res.status(201).json({ applied });
});
router.delete('/sessions/:sessionId', (req, res) => {
  const updatedAt = req.body?.updatedAt ?? new Date().toISOString();
  if (!validTimestamp(updatedAt)) { res.status(400).json({ error: 'Data non valida' }); return; }
  const db = getDb();
  db.transaction(() => {
    const existing = db.prepare('SELECT updatedAt FROM sessions WHERE sessionId = ?').get(req.params.sessionId) as { updatedAt: string } | undefined;
    const deleted = db.prepare('SELECT updatedAt FROM deleted_sessions WHERE sessionId = ?').get(req.params.sessionId) as { updatedAt: string } | undefined;
    if (existing && existing.updatedAt > updatedAt || deleted && deleted.updatedAt > updatedAt) return;
    db.prepare('DELETE FROM sessions WHERE sessionId = ?').run(req.params.sessionId);
    db.prepare('INSERT OR REPLACE INTO deleted_sessions (sessionId,updatedAt) VALUES (?,?)').run(req.params.sessionId, updatedAt);
  })(); res.status(204).send();
});
router.put('/settings/:key', (req, res) => {
  const { value, updatedAt } = req.body ?? {};
  if (!['templates', 'preferences'].includes(req.params.key) || value === undefined || !validTimestamp(updatedAt)) { res.status(400).json({ error: 'Impostazioni non valide' }); return; }
  const db = getDb();
  db.prepare(`INSERT INTO settings (key,value,updatedAt) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updatedAt=excluded.updatedAt WHERE excluded.updatedAt > settings.updatedAt`).run(req.params.key, JSON.stringify(value), updatedAt);
  res.json({ saved: true });
});
router.post('/sync', (req, res) => {
  const sessions: Sessione[] = Array.isArray(req.body?.sessions) ? req.body.sessions : [];
  let imported = 0;
  getDb().transaction(() => { for (const session of sessions) if (valid(session) && upsert(session)) imported++; })(); res.json({ imported });
});
export default router;
