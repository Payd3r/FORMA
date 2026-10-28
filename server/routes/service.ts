import { Router } from 'express';
import { getDb, parseSessionRow, type SessionRow } from '../db.js';

const router = Router();

/**
 * Middleware che verifica il Bearer token statico per l'accesso service-to-service.
 * Il token viene configurato tramite la variabile d'ambiente SERVICE_API_TOKEN.
 */
function serviceTokenAuth(req: any, res: any, next: any) {
  const authHeader = req.headers['authorization'] as string | undefined;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
  const expected = process.env.SERVICE_API_TOKEN;

  if (!expected) {
    res.status(503).json({ error: 'Service token not configured on server' });
    return;
  }

  if (!token || token !== expected) {
    res.status(401).json({ error: 'Invalid or missing Bearer token' });
    return;
  }

  next();
}

/**
 * GET /api/service/sessions
 * Restituisce tutte le sessioni del DB, senza filtri per userId.
 * Richiede: Authorization: Bearer <SERVICE_API_TOKEN>
 */
router.get('/service/sessions', serviceTokenAuth, (_req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM sessions ORDER BY date DESC').all() as SessionRow[];
  console.log('[Service API] Fetched', rows.length, 'sessions');
  res.json(rows.map(parseSessionRow));
});

/**
 * GET /api/service/sessions/:sessionId
 * Restituisce una sessione specifica per ID.
 * Richiede: Authorization: Bearer <SERVICE_API_TOKEN>
 */
router.get('/service/sessions/:sessionId', serviceTokenAuth, (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM sessions WHERE sessionId = ?').get(req.params.sessionId) as SessionRow | undefined;
  if (!row) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  res.json(parseSessionRow(row));
});

/**
 * GET /api/service/health
 * Health check autenticato con conteggio sessioni.
 * Richiede: Authorization: Bearer <SERVICE_API_TOKEN>
 */
router.get('/service/health', serviceTokenAuth, (_req, res) => {
  const db = getDb();
  const count = (db.prepare('SELECT COUNT(*) as count FROM sessions').get() as { count: number }).count;
  res.json({
    status: 'ok',
    sessionCount: count,
    timestamp: new Date().toISOString()
  });
});

export default router;
